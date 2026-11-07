/**
 * Screen recordings for tutorials (the test's how-to videos, the AGS walkthroughs): a steps file drives
 * Chromium on a real page at a phone's size while it records; the "say" steps are spoken by the voice,
 * each placed at the moment the recording reached it, so the words land on what the screen shows
 * however long the clicks take. Highlights and zooms are drawn on the page; the captions, the brand and
 * the closing frame are overlaid as for any video.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Browser } from "playwright";
import type { Step, VideoSpec } from "./spec";
import type { Word } from "./timeline";
import { captionSegments } from "./timeline";
import { ffmpeg } from "./ffmpeg";

export interface Recording {
  readonly video: string;
  readonly seconds: number;
  /** When each "say" step started, in seconds from the start of the recording. */
  readonly sayStarts: number[];
}

/** The narration's words, split per "say" step in order. */
export function splitBySay(steps: readonly Step[], words: readonly Word[]): Word[][] {
  const out: Word[][] = [];
  let i = 0;
  for (const step of steps) {
    if (step.do !== "say") continue;
    const n = step.text.split(/\s+/).filter(Boolean).length;
    out.push(words.slice(i, i + n));
    i += n;
  }
  return out;
}

export async function recordSteps(browser: Browser, steps: readonly Step[], parts: readonly Word[][], workDir: string): Promise<Recording> {
  const dir = path.join(workDir, "recording");
  await mkdir(dir, { recursive: true });
  // A phone's page (432×768 CSS pixels at 2.5×), captured by Chromium's own screencast at 1080×1920:
  // Playwright's recorder would draw the page at CSS size in a corner of the frame.
  const context = await browser.newContext({ viewport: { width: 432, height: 768 }, deviceScaleFactor: 2.5, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  const frames: { file: string; at: number }[] = [];
  let pending = Promise.resolve();
  const t0 = Date.now();
  cdp.on("Page.screencastFrame", (frame: { data: string; sessionId: number }) => {
    const at = (Date.now() - t0) / 1000;
    const file = path.join(dir, `frame-${String(frames.length).padStart(6, "0")}.jpg`);
    frames.push({ file, at });
    pending = pending.then(() => writeFile(file, Buffer.from(frame.data, "base64"))).then(() => cdp.send("Page.screencastFrameAck", { sessionId: frame.sessionId })).then(() => undefined, () => undefined);
  });
  await cdp.send("Page.startScreencast", { format: "jpeg", quality: 88, maxWidth: 1080, maxHeight: 1920, everyNthFrame: 1 });
  const sayStarts: number[] = [];
  const pause = (s: number) => page.waitForTimeout(Math.round(s * 1000));
  let sayIndex = 0;
  try {
    for (const step of steps) {
      switch (step.do) {
        case "goto":
          await page.goto(step.url, { waitUntil: "networkidle" }).catch(() => page.waitForTimeout(1500));
          break;
        case "click":
          await page.locator(step.selector).first().click({ timeout: 10000 });
          break;
        case "type":
          await page.locator(step.selector).first().pressSequentially(step.text, { delay: 70 });
          break;
        case "wait":
          await pause(step.seconds);
          break;
        case "scroll":
          await page.mouse.wheel(0, step.y);
          await pause(0.6);
          break;
        case "highlight":
          await page.locator(step.selector).first().evaluate((el) => {
            el.scrollIntoView({ block: "center", behavior: "smooth" });
            (el as HTMLElement).style.outline = "4px solid #b5512c";
            (el as HTMLElement).style.outlineOffset = "6px";
            (el as HTMLElement).style.borderRadius = "10px";
          });
          await pause(step.seconds);
          await page.locator(step.selector).first().evaluate((el) => {
            (el as HTMLElement).style.outline = "";
          });
          break;
        case "zoom": {
          const box = await page.locator(step.selector).first().boundingBox();
          if (box) {
            await page.evaluate(({ x, y }) => {
              document.body.style.transition = "transform .6s ease";
              document.body.style.transformOrigin = `${x}px ${y}px`;
              document.body.style.transform = "scale(1.6)";
            }, { x: box.x + box.width / 2, y: box.y + box.height / 2 });
            await pause(step.seconds);
            await page.evaluate(() => {
              document.body.style.transform = "";
            });
            await pause(0.6);
          }
          break;
        }
        case "say": {
          sayStarts.push((Date.now() - t0) / 1000);
          const words = parts[sayIndex++] ?? [];
          const seconds = words.length ? words[words.length - 1]!.end - words[0]!.start : 1;
          await pause(seconds + 0.25);
          break;
        }
      }
    }
    await pause(0.5);
    await cdp.send("Page.stopScreencast").catch(() => undefined);
    await pending;
  } finally {
    await context.close();
  }
  const seconds = (Date.now() - t0) / 1000;
  if (frames.length === 0) throw new Error("the screencast sent no frame");
  // Each frame held until the next one came (the screencast only sends a frame when the page changes).
  const list = path.join(dir, "frames.txt");
  const lines: string[] = [];
  frames.forEach((f, i) => {
    const next = frames[i + 1]?.at ?? seconds;
    lines.push(`file '${f.file}'`, `duration ${Math.max(0.01, next - f.at).toFixed(3)}`);
  });
  lines.push(`file '${frames[frames.length - 1]!.file}'`);
  await writeFile(list, lines.join("\n") + "\n");
  const video = path.join(workDir, "recording.mp4");
  const lead = frames[0]!.at;
  await ffmpeg(["-f", "concat", "-safe", "0", "-i", list, "-vf", `tpad=start_duration=${lead.toFixed(3)}:start_mode=clone,scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=0xf3f1ea,fps=30`, "-c:v", "libx264", "-preset", "veryfast", "-crf", "18", "-pix_fmt", "yuv420p", "-t", seconds.toFixed(3), video]);
  return { video, seconds, sayStarts };
}

/** The voice re-cut: each say's words moved to when the recording reached it. */
export async function placeVoice(voiceFile: string, parts: readonly Word[][], sayStarts: readonly number[], duration: number, spec: VideoSpec, workDir: string): Promise<{ audio: string; words: Word[] }> {
  const filters: string[] = [];
  const labels: string[] = [];
  const shifted: Word[] = [];
  parts.forEach((ws, i) => {
    if (!ws.length) return;
    const from = Math.max(0, ws[0]!.start - 0.05);
    const to = ws[ws.length - 1]!.end + 0.1;
    const at = sayStarts[i] ?? 0;
    filters.push(`[0:a]atrim=${from.toFixed(3)}:${to.toFixed(3)},asetpts=PTS-STARTPTS,adelay=${Math.round(at * 1000)}:all=1[s${i}]`);
    labels.push(`[s${i}]`);
    for (const w of ws) shifted.push({ text: w.text, start: w.start - from + at, end: w.end - from + at });
  });
  const audio = path.join(workDir, "screen-audio.wav");
  const target = `I=${spec.audio.loudness_lufs}:TP=-1.5:LRA=11`;
  const graph = `${filters.join(";")};${labels.join("")}amix=inputs=${labels.length}:normalize=0,apad=whole_dur=${duration.toFixed(3)},loudnorm=${target}`;
  await ffmpeg(["-i", voiceFile, "-filter_complex", graph, "-t", duration.toFixed(3), "-ar", "44100", "-c:a", "pcm_s16le", audio]);
  return { audio, words: shifted };
}

/** The recording at the video's size, held on its last frame for the closing second. */
export async function prepareRecording(recording: string, duration: number, workDir: string): Promise<string> {
  const out = path.join(workDir, "recording-prepared.mp4");
  await ffmpeg(["-i", recording, "-vf", `fps=30,tpad=stop_mode=clone:stop_duration=3`, "-t", duration.toFixed(3), "-c:v", "libx264", "-preset", "veryfast", "-crf", "18", "-pix_fmt", "yuv420p", "-an", out]);
  return out;
}

export function screenCaptions(words: readonly Word[], perSegment = 3) {
  return captionSegments(words, perSegment);
}
