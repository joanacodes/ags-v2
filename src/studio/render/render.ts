/**
 * The render worker: every approved piece without media becomes rendered. Videos go through the
 * engine (voice, timeline, frames, composer, media gate), pictures through the templates, text-only
 * pieces need nothing. Files go to the bucket as {week}/{card}/{post}.{ext}, each with a studio_media
 * row; a piece whose media fail their gate becomes failed, with why, and shows on Today.
 */
import { mediaNeed } from "./need";
import { mkdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import type { Browser } from "playwright";
import type { AgentContext } from "../agents/context";
import type { CardRow, GateResult, MediaRow, PostRow } from "../store/rows";
import { buildSpec, videoSpecSchema, type VideoSpec } from "../video/spec";
import { buildTimeline } from "../video/timeline";
import { speak, VoiceNotConfigured } from "../video/tts";
import { renderFrames, renderPictures, launchBrowser } from "../video/frames";
import { compose, prepareAudio } from "../video/compose";
import { checkPictures, checkVideo } from "../gate/media";
import { pictureJob } from "../pictures/jobs";
import { pictures } from "../pictures/templates";
import { voiceCap } from "../caps";
import { withRun, SkipRun, type RunLog } from "../run";
import { pathToFileURL } from "node:url";
import { probe } from "../video/ffmpeg";
import { placeVoice, prepareRecording, recordSteps, splitBySay } from "../video/screen";
import type { Timeline } from "../video/timeline";

export interface RenderEnv {
  readonly ctx: AgentContext;
  readonly browser: Browser;
  /** public/studio on disk: templates/, fonts/, media/. */
  readonly publicDir: string;
  readonly workRoot: string;
  readonly elevenLabsKey: string | null;
  readonly allowSilent: boolean;
}


export function mediaBase(post: Pick<PostRow, "id" | "card_id">, card: Pick<CardRow, "week">): string {
  return `${card.week}/${post.card_id}/${post.id}`;
}

async function sha256(file: string): Promise<string> {
  return createHash("sha256").update(await readFile(file)).digest("hex");
}

async function upload(env: RenderEnv, file: string, key: string, contentType: string, row: Omit<MediaRow, "id" | "created_at" | "path" | "bytes" | "sha256">): Promise<MediaRow> {
  const bytes = await readFile(file);
  await env.ctx.storage.upload(key, bytes, contentType);
  return env.ctx.store.insertMedia({ ...row, path: key, bytes: bytes.byteLength, sha256: await sha256(file) });
}

/** The spec a piece renders with: the one saved from the Video studio if it is whole, else built now. */
export function specFor(post: PostRow, card: CardRow, env: Pick<RenderEnv, "ctx">): VideoSpec {
  const saved = videoSpecSchema.safeParse(post.spec);
  if (saved.success && (post.spec as Record<string, unknown>)["kind"] === "full") return saved.data;
  return buildSpec(post, card, env.ctx.kit, env.ctx.settings.get("render-video"));
}

export async function renderVideoPiece(env: RenderEnv, post: PostRow, card: CardRow): Promise<{ gate: GateResult; media: MediaRow[]; seconds: number }> {
  const spec = specFor(post, card, env);
  const work = path.join(env.workRoot, post.id);
  await rm(work, { recursive: true, force: true });
  await mkdir(work, { recursive: true });
  if (spec.template === "screen-recording") return renderScreenPiece(env, post, card, spec, work);
  const voice = await speak(spec.script, spec, { store: env.ctx.store, storage: env.ctx.storage, apiKey: env.elevenLabsKey, allowSilent: env.allowSilent, workDir: work });
  const timeline = buildTimeline(spec.lines, voice.words, { disclosure: !voice.silent && spec.overlays.disclosure, perSegment: spec.captions.words_per_segment });
  if (timeline.duration > spec.output.max_seconds + 1) {
    return {
      gate: { ok: false, checked_at: new Date().toISOString(), failures: [{ check: "duration", message: `the voice runs ${timeline.duration.toFixed(1)} s; the most is ${spec.output.max_seconds} s: shorten the script` }], warnings: [], media: true },
      media: [],
      seconds: timeline.duration,
    };
  }
  const frames = await renderFrames(env.browser, spec, timeline, path.join(env.publicDir, "templates"), path.join(work, "frames"));
  const audio = await prepareAudio(voice.file, null, spec, timeline.duration, voice.silent, work);
  const background = path.join(env.publicDir, "media", `${spec.background.src}.mp4`);
  const out = await compose(spec, timeline, frames, audio, background, work);
  const platforms = [post.platform];
  const gate = await checkVideo(out.video, {
    format: post.format,
    platforms,
    width: 1080,
    height: 1920,
    seconds: post.format === "long_video" ? [120, 900] : [10, 60],
    voiced: !voice.silent,
    srt: out.srt,
    hasDisclosureScene: timeline.scenes.some((s) => s.kind === "disclosure"),
    loudnessTarget: voice.silent ? undefined : spec.audio.loudness_lufs,
    templateWarnings: frames.warnings,
  });
  if (voice.silent) gate.warnings.push({ check: "voice", message: "rendered without a voice (a preview or a dry run): the published video needs the voice set up" });
  const base = mediaBase(post, card);
  const p = await probe(out.video);
  const media: MediaRow[] = [];
  media.push(await upload(env, out.video, `${base}.mp4`, "video/mp4", { post_id: post.id, kind: "video", duration_ms: Math.round(p.duration * 1000), width: p.width, height: p.height, meta: { template: spec.template, silent: voice.silent, voice_hash: voice.hash } }));
  media.push(await upload(env, out.srt, `${base}.srt`, "application/x-subrip", { post_id: post.id, kind: "srt", duration_ms: null, width: null, height: null, meta: {} }));
  media.push(await upload(env, out.thumbnail, `${base}.jpg`, "image/jpeg", { post_id: post.id, kind: "thumbnail", duration_ms: null, width: 1080, height: 1920, meta: {} }));
  media.push(await upload(env, out.timelineFile, `${base}.timeline.json`, "application/json", { post_id: post.id, kind: "timeline", duration_ms: null, width: null, height: null, meta: {} }));
  await rm(work, { recursive: true, force: true });
  return { gate, media, seconds: p.duration };
}

/** A screen recording: the steps on a real page, the voice placed where each line was said. */
async function renderScreenPiece(env: RenderEnv, post: PostRow, card: CardRow, spec: VideoSpec, work: string): Promise<{ gate: GateResult; media: MediaRow[]; seconds: number }> {
  const steps = spec.steps ?? [];
  if (!steps.some((s) => s.do === "say")) throw new Error("a screen recording needs at least one \"say\" step");
  const narration = steps.flatMap((s) => (s.do === "say" ? [s.text] : [])).join(" ");
  const voice = await speak(narration, spec, { store: env.ctx.store, storage: env.ctx.storage, apiKey: env.elevenLabsKey, allowSilent: env.allowSilent, workDir: work });
  const parts = splitBySay(steps, voice.words);
  const rec = await recordSteps(env.browser, steps, parts, work);
  const disclosure = !voice.silent && spec.overlays.disclosure;
  const duration = Math.round((rec.seconds + (disclosure ? 1 : 0)) * 1000) / 1000;
  const placed = await placeVoice(voice.file, parts, rec.sayStarts, duration, spec, work);
  const captions = buildTimeline([narration], placed.words, { disclosure: false, perSegment: spec.captions.words_per_segment }).captions;
  const timeline: Timeline = {
    duration,
    voiceEnd: placed.words[placed.words.length - 1]?.end ?? 0,
    words: placed.words,
    captions,
    scenes: [
      { index: 0, kind: "line", text: "", start: 0, end: disclosure ? duration - 1 : duration },
      ...(disclosure ? [{ index: 1, kind: "disclosure" as const, text: "", start: duration - 1, end: duration }] : []),
    ],
  };
  const frames = await renderFrames(env.browser, spec, timeline, path.join(env.publicDir, "templates"), path.join(work, "frames"));
  const background = await prepareRecording(rec.video, duration, work);
  const out = await compose({ ...spec, background: { ...spec.background, speed: 1 } }, timeline, frames, placed.audio, background, work);
  const gate = await checkVideo(out.video, {
    format: post.format,
    platforms: [post.platform],
    width: 1080,
    height: 1920,
    seconds: post.format === "long_video" ? [60, 900] : [10, 180],
    voiced: !voice.silent,
    srt: out.srt,
    hasDisclosureScene: disclosure,
    loudnessTarget: voice.silent ? undefined : spec.audio.loudness_lufs,
    templateWarnings: frames.warnings,
  });
  const base = mediaBase(post, card);
  const p = await probe(out.video);
  const media: MediaRow[] = [
    await upload(env, out.video, `${base}.mp4`, "video/mp4", { post_id: post.id, kind: "video", duration_ms: Math.round(p.duration * 1000), width: p.width, height: p.height, meta: { template: spec.template, silent: voice.silent } }),
    await upload(env, out.srt, `${base}.srt`, "application/x-subrip", { post_id: post.id, kind: "srt", duration_ms: null, width: null, height: null, meta: {} }),
    await upload(env, out.thumbnail, `${base}.jpg`, "image/jpeg", { post_id: post.id, kind: "thumbnail", duration_ms: null, width: 1080, height: 1920, meta: {} }),
  ];
  await rm(work, { recursive: true, force: true });
  return { gate, media, seconds: p.duration };
}

export async function renderPicturePiece(env: RenderEnv, post: PostRow, card: CardRow): Promise<{ gate: GateResult; media: MediaRow[] }> {
  const job = pictureJob(post.format === "text" ? { ...post, format: "still" } : post, card);
  if (!job) return { gate: { ok: false, checked_at: new Date().toISOString(), failures: [{ check: "opens", message: "nothing to draw: the piece has no slides or title" }], warnings: [], media: true }, media: [] };
  const assets = { fonts: pathToFileURL(path.join(env.publicDir, "fonts")).href + "/", media: pathToFileURL(path.join(env.publicDir, "media")).href + "/" };
  const list = pictures(job, assets);
  const work = path.join(env.workRoot, post.id);
  await mkdir(work, { recursive: true });
  const shot = await renderPictures(env.browser, list, work, "picture");
  const first = list[0]!;
  const format = post.format === "text" ? "still" : post.format;
  const gate = checkPictures(shot.files, { format, platforms: [post.platform], width: first.width, height: first.height, voiced: false, templateWarnings: shot.warnings });
  const base = mediaBase(post, card);
  const media: MediaRow[] = [];
  for (const [i, f] of shot.files.entries()) {
    const suffix = shot.files.length > 1 ? `-${String(i + 1).padStart(2, "0")}` : "";
    media.push(await upload(env, f.file, `${base}${suffix}.jpg`, "image/jpeg", { post_id: post.id, kind: "image", duration_ms: null, width: f.width, height: f.height, meta: { slide: i + 1, of: shot.files.length } }));
  }
  await rm(work, { recursive: true, force: true });
  return { gate, media };
}


export async function renderOne(env: RenderEnv, post: PostRow, card: CardRow, log: RunLog): Promise<"rendered" | "failed"> {
  const { store } = env.ctx;
  const need = mediaNeed(post);
  const old = await store.media({ postIds: [post.id] });
  if (old.length) {
    await env.ctx.storage.remove(old.map((m) => m.path)).catch(() => undefined);
    await store.deleteMedia(old.map((m) => m.id));
  }
  if (!need) {
    await store.updatePosts([post.id], { status: "rendered", gate: post.gate ? { ...post.gate, media: true } : null }, "render");
    return "rendered";
  }
  try {
    const result = need === "video" ? await renderVideoPiece(env, post, card) : await renderPicturePiece(env, post, card);
    log.count("studio_media", result.media.length);
    if (result.gate.ok) {
      await store.updatePosts([post.id], { status: "rendered", gate: { ...(post.gate ?? result.gate), warnings: [...(post.gate?.warnings ?? []), ...result.gate.warnings], media: true }, error: null }, "render");
      return "rendered";
    }
    await store.updatePosts([post.id], { status: "failed", gate: result.gate, error: result.gate.failures.map((f) => f.message).join("; ") }, "render");
    return "failed";
  } catch (err) {
    const message = err instanceof VoiceNotConfigured ? err.message : `render failed: ${err instanceof Error ? err.message : String(err)}`;
    await store.updatePosts([post.id], { status: "failed", error: message }, "render");
    log.note(`${post.platform} ${post.format}: ${message}`);
    return "failed";
  }
}

/** The nightly render, or a dispatch for some pieces: approved pieces without media, up to the night's limit. */
export async function runRender(ctx: AgentContext, options: { postIds?: string[]; publicDir: string; workRoot: string; allowSilent?: boolean }) {
  const { store, settings } = ctx;
  return withRun(store, { agent: "render", trigger: ctx.trigger }, async (log) => {
    if (settings.get("global").paused) throw new SkipRun("skipped", "the Studio is paused (kill switch)");
    const video = settings.get("render-video");
    const pics = settings.get("render-pictures");
    const approved = await store.posts({ ids: options.postIds, statuses: ["approved"] });
    if (approved.length === 0) throw new SkipRun("skipped", "nothing approved waits for its media");
    const cards = await store.cards({ ids: [...new Set(approved.map((p) => p.card_id))] });
    const cap = await voiceCap(store, settings, ctx.now);
    const browser = await launchBrowser();
    let rendered = 0;
    let failed = 0;
    let videos = 0;
    try {
      for (const post of approved) {
        const card = cards.find((c) => c.id === post.card_id);
        if (!card) continue;
        const need = mediaNeed(post);
        if (need === "video") {
          if (!video.enabled) continue;
          if (!cap.ok) {
            log.note(cap.reason ?? "the voice minutes are capped");
            continue;
          }
          if (videos >= video.renders_per_night) {
            log.note(`the night's limit of ${video.renders_per_night} videos is reached; the rest wait for tomorrow`);
            continue;
          }
          videos += 1;
        }
        if (need === "picture" && !pics.enabled) continue;
        const outcome = await renderOne({ ctx, browser, publicDir: options.publicDir, workRoot: options.workRoot, elevenLabsKey: (process.env.ELEVENLABS_API_KEY ?? "").trim() || null, allowSilent: options.allowSilent ?? false }, post, card, log);
        if (outcome === "rendered") rendered += 1;
        else failed += 1;
      }
    } finally {
      await browser.close();
    }
    log.count("studio_posts", rendered + failed);
    log.note(`${rendered} rendered, ${failed} failed`);
    return { outcome: rendered === 0 && failed === 0 && !cap.ok ? ("capped" as const) : ("ok" as const) };
  });
}

export { mediaNeed } from "./need";
