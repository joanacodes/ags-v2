/**
 * The composer: the meadow loop (slowed, looped to the length), a real blur of it under each glass
 * panel, the template's frames over it for their intervals, the voice normalised to the loudness target
 * (two passes, so it lands within a unit of it), H.264 high profile and AAC 128 kbps, the SRT and the
 * thumbnail at the hook.
 */
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { ffmpeg } from "./ffmpeg";
import type { Frames } from "./frames";
import type { Timeline } from "./timeline";
import { toSrt } from "./timeline";
import type { VideoSpec } from "./spec";

export interface Composed {
  readonly video: string;
  readonly srt: string;
  readonly thumbnail: string;
  readonly timelineFile: string;
}

const W = 1080;
const H = 1920;

/** The voice padded to the length and brought to the loudness target; silence stays silence. */
export async function prepareAudio(voice: string, music: string | null, spec: VideoSpec, duration: number, silent: boolean, workDir: string): Promise<string> {
  const out = path.join(workDir, "audio.wav");
  const pad = `apad=whole_dur=${duration.toFixed(3)}`;
  if (silent) {
    await ffmpeg(["-f", "lavfi", "-i", `anullsrc=r=44100:cl=stereo`, "-t", duration.toFixed(3), "-c:a", "pcm_s16le", out]);
    return out;
  }
  const inputs = ["-i", voice, ...(music ? ["-stream_loop", "-1", "-i", music] : [])];
  // With music: the bed ducks under the voice (sidechain), then both are mixed.
  const mix = music
    ? `[0:a]aresample=44100,${pad},asplit=2[v1][v2];[1:a]aresample=44100,volume=${spec.audio.music_db}dB,atrim=0:${duration.toFixed(3)}[bed];[bed][v1]sidechaincompress=threshold=0.04:ratio=8:attack=20:release=400[ducked];[v2][ducked]amix=inputs=2:duration=first:normalize=0`
    : `[0:a]aresample=44100,${pad}`;
  const target = `I=${spec.audio.loudness_lufs}:TP=-1.5:LRA=11`;
  const first = await ffmpeg([...inputs, "-filter_complex", `${mix},loudnorm=${target}:print_format=json`, "-f", "null", "-"]);
  const json = /\{[\s\S]*?"input_i"[\s\S]*?\}/.exec(first.stderr)?.[0];
  let second = `loudnorm=${target}`;
  if (json) {
    const m = JSON.parse(json) as Record<string, string>;
    if (m["input_i"] && m["input_i"] !== "-inf") {
      second = `loudnorm=${target}:measured_I=${m["input_i"]}:measured_TP=${m["input_tp"]}:measured_LRA=${m["input_lra"]}:measured_thresh=${m["input_thresh"]}:offset=${m["target_offset"]}:linear=true`;
    }
  }
  await ffmpeg([...inputs, "-filter_complex", `${mix},${second},aresample=44100`, "-t", duration.toFixed(3), "-c:a", "pcm_s16le", out]);
  return out;
}

export async function compose(spec: VideoSpec, timeline: Timeline, frames: Frames, audio: string, background: string, workDir: string): Promise<Composed> {
  const duration = timeline.duration;
  const video = path.join(workDir, "video.mp4");
  // The states as one stream with alpha, each shown for its interval (the concat demuxer's durations).
  const list = path.join(workDir, "states.txt");
  const lines: string[] = [];
  for (const s of frames.states) {
    lines.push(`file '${s.file.replace(/'/g, "'\\''")}'`);
    lines.push(`duration ${Math.max(0.034, s.end - s.start).toFixed(3)}`);
  }
  const last = frames.states[frames.states.length - 1];
  if (last) lines.push(`file '${last.file.replace(/'/g, "'\\''")}'`);
  await writeFile(list, lines.join("\n") + "\n");

  const speed = spec.background.speed;
  const fps = spec.output.fps;
  const bg = `[0:v]setpts=PTS/${speed},scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},fps=${fps},trim=duration=${duration.toFixed(3)},setpts=PTS-STARTPTS,format=yuv420p`;
  const inputs = ["-stream_loop", "-1", "-i", background, "-f", "concat", "-safe", "0", "-i", list, "-i", audio];
  let graph: string;
  if (frames.mask) {
    inputs.push("-loop", "1", "-i", frames.mask);
    graph = [
      `${bg},split=2[bg1][bg2]`,
      `[bg2]gblur=sigma=32,eq=saturation=1.4:brightness=0.04,format=rgba[blur]`,
      `[3:v]format=gray,scale=${W}:${H},trim=duration=${duration.toFixed(3)}[mask]`,
      `[blur][mask]alphamerge[glass]`,
      `[bg1][glass]overlay=0:0:shortest=1[base]`,
      `[1:v]fps=${fps},format=rgba[ov]`,
      `[base][ov]overlay=0:0:eof_action=repeat:format=auto,format=yuv420p[v]`,
    ].join(";");
  } else {
    graph = [`${bg}[base]`, `[1:v]fps=${fps},format=rgba[ov]`, `[base][ov]overlay=0:0:eof_action=repeat:format=auto,format=yuv420p[v]`].join(";");
  }
  await ffmpeg([
    ...inputs,
    "-filter_complex",
    graph,
    "-map",
    "[v]",
    "-map",
    "2:a",
    "-t",
    duration.toFixed(3),
    "-c:v",
    "libx264",
    "-profile:v",
    "high",
    "-preset",
    process.env.STUDIO_X264_PRESET || "medium",
    "-crf",
    "20",
    "-pix_fmt",
    "yuv420p",
    "-r",
    String(fps),
    "-c:a",
    "aac",
    "-b:a",
    "128k",
    "-ar",
    "44100",
    "-movflags",
    "+faststart",
    video,
  ]);

  const srt = path.join(workDir, "video.srt");
  await writeFile(srt, toSrt(timeline.captions));
  const thumbnail = path.join(workDir, "thumbnail.jpg");
  const hook = timeline.scenes.find((s) => s.kind === "hook");
  const at = spec.output.thumbnail_at === "hook" && hook ? Math.min(hook.end - 0.2, Math.max(0.5, (hook.start + hook.end) / 2)) : duration / 2;
  await ffmpeg(["-ss", at.toFixed(3), "-i", video, "-frames:v", "1", "-q:v", "3", thumbnail]);
  const timelineFile = path.join(workDir, "timeline.json");
  await writeFile(timelineFile, JSON.stringify({ duration, scenes: timeline.scenes, captions: timeline.captions, states: frames.states.map((s) => ({ start: s.start, end: s.end })), glass: frames.glass, warnings: frames.warnings }, null, 1));
  return { video, srt, thumbnail, timelineFile };
}
