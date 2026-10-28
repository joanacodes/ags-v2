/**
 * The media gate, after every render: the file opens; its length, size and shape fit the format and
 * every network it goes to; the captions and the disclosure are there; the loudness is within a unit of
 * the target; no text was cut at a box's edge. Failures name the check, as the text gate's do.
 */
import { stat } from "node:fs/promises";
import type { GateResult } from "../store/rows";
import type { Format, Platform } from "../types";
import { loudness, probe } from "../video/ffmpeg";

/** Megabytes each network takes for one video (the smallest of their published limits). */
export const VIDEO_SIZE_MB: Readonly<Partial<Record<Platform, number>>> = {
  tiktok: 287,
  instagram: 250,
  facebook: 1000,
  youtube: 10000,
  threads: 1000,
  bluesky: 100,
  mastodon: 99,
  x: 512,
  pinterest: 2000,
};

export interface MediaExpectations {
  readonly format: Format;
  readonly platforms: readonly Platform[];
  readonly width: number;
  readonly height: number;
  readonly seconds?: readonly [number, number];
  readonly voiced: boolean;
  readonly srt?: string | null;
  readonly hasDisclosureScene?: boolean;
  readonly loudnessTarget?: number;
  readonly templateWarnings?: readonly string[];
  readonly slides?: number;
}

export async function checkVideo(file: string, e: MediaExpectations, now: Date = new Date()): Promise<GateResult> {
  const failures: { check: string; message: string }[] = [];
  const warnings: { check: string; message: string }[] = [];
  let p;
  try {
    p = await probe(file);
  } catch (err) {
    return { ok: false, checked_at: now.toISOString(), failures: [{ check: "opens", message: `the file doesn't open: ${err instanceof Error ? err.message : String(err)}` }], warnings: [], media: true };
  }
  if (!p.hasVideo) failures.push({ check: "opens", message: "no video stream" });
  if (p.width !== e.width || p.height !== e.height) failures.push({ check: "resolution", message: `${p.width}×${p.height}; the format wants ${e.width}×${e.height}` });
  if (e.seconds && (p.duration < e.seconds[0] - 0.05 || p.duration > e.seconds[1] + 0.05)) {
    failures.push({ check: "duration", message: `${p.duration.toFixed(1)} s; a ${e.format} runs ${e.seconds[0]} to ${e.seconds[1]} s` });
  }
  if (!p.hasAudio) failures.push({ check: "audio", message: "no audio track" });
  const mb = p.size / 1_000_000;
  for (const platform of e.platforms) {
    const limit = VIDEO_SIZE_MB[platform];
    if (limit !== undefined && mb > limit) failures.push({ check: "size", message: `${mb.toFixed(1)} MB; ${platform} takes ${limit} MB` });
  }
  if (e.srt !== undefined) {
    if (!e.srt) failures.push({ check: "captions", message: "no SRT file" });
    else {
      const s = await stat(e.srt).catch(() => null);
      if (!s || s.size === 0) failures.push({ check: "captions", message: "the SRT file is empty" });
    }
  }
  if (e.voiced && e.hasDisclosureScene === false) failures.push({ check: "disclosure", message: "a voiced video ends with the AI-voice disclosure frame" });
  if (e.voiced && e.loudnessTarget !== undefined) {
    const lufs = await loudness(file);
    if (lufs === null) failures.push({ check: "loudness", message: "the voice is silent" });
    else if (Math.abs(lufs - e.loudnessTarget) > 1) failures.push({ check: "loudness", message: `${lufs.toFixed(1)} LUFS; the target is ${e.loudnessTarget} (±1)` });
  }
  for (const w of e.templateWarnings ?? []) warnings.push({ check: "text-fit", message: w });
  return { ok: failures.length === 0, checked_at: now.toISOString(), failures, warnings, media: true };
}

/** Bytes each network takes for one picture, where the limit is tight enough to matter. */
export const PICTURE_BYTES: Readonly<Partial<Record<Platform, number>>> = { bluesky: 976_000, x: 5_000_000, instagram: 8_000_000 };

export function checkPictures(files: readonly { width: number; height: number; bytes?: number }[], e: MediaExpectations, now: Date = new Date()): GateResult {
  const failures: { check: string; message: string }[] = [];
  if (files.length === 0) failures.push({ check: "opens", message: "no picture was rendered" });
  for (const platform of e.platforms) {
    const limit = PICTURE_BYTES[platform];
    const big = files.find((f) => limit !== undefined && f.bytes !== undefined && f.bytes > limit);
    if (big && limit !== undefined) failures.push({ check: "size", message: `${Math.round((big.bytes ?? 0) / 1000)} KB; ${platform} takes ${Math.round(limit / 1000)} KB a picture` });
  }
  for (const f of files) if (f.width !== e.width || f.height !== e.height) failures.push({ check: "resolution", message: `${f.width}×${f.height}; the format wants ${e.width}×${e.height}` });
  if (e.format === "carousel" && (files.length < 5 || files.length > 10)) failures.push({ check: "slides", message: `${files.length} slides; a carousel has 5 to 10` });
  if (e.format === "pin" && files.some((f) => Math.abs(f.width / f.height - 2 / 3) > 0.01)) failures.push({ check: "ratio", message: "a pin is 2:3" });
  const warnings = (e.templateWarnings ?? []).map((w) => ({ check: "text-fit", message: w }));
  if (warnings.length) failures.push({ check: "text-fit", message: "some text didn't fit its card even at its smallest size: shorten it" });
  return { ok: failures.length === 0, checked_at: now.toISOString(), failures, warnings, media: true };
}
