/**
 * The voice: ElevenLabs text-to-speech with character timestamps, cached by the hash of the script, the
 * voice and its settings, so a preview and the final render share one call, and a re-render costs
 * nothing. Every call is recorded in studio_tts, which is what the monthly minutes cap reads.
 */
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { MediaStorage, StudioStore } from "../store/store";
import type { VideoSpec } from "./spec";
import { estimatedWords, wordsFromAlignment, type Alignment, type Word } from "./timeline";
import { ffmpeg, probe } from "./ffmpeg";

export class VoiceNotConfigured extends Error {}

export interface Voice {
  readonly file: string;
  readonly words: Word[];
  readonly durationMs: number;
  readonly hash: string;
  readonly cached: boolean;
  readonly silent: boolean;
}

export interface VoiceDeps {
  readonly store: StudioStore;
  readonly storage: MediaStorage;
  readonly apiKey: string | null;
  /** Previews and local dry runs may go without a voice: a silent track timed at 150 words a minute. */
  readonly allowSilent: boolean;
  readonly workDir: string;
  readonly fetchImpl?: typeof fetch;
}

export function voiceHash(text: string, voice: VideoSpec["voice"]): string {
  return createHash("sha256")
    .update(JSON.stringify({ text, id: voice.voice_id, model: voice.model_id, s: voice.stability, b: voice.similarity_boost, st: voice.style }))
    .digest("hex")
    .slice(0, 40);
}

interface ElevenResponse {
  audio_base64?: string;
  alignment?: Alignment | null;
}

export async function speak(text: string, spec: Pick<VideoSpec, "voice" | "language">, deps: VoiceDeps): Promise<Voice> {
  await mkdir(deps.workDir, { recursive: true });
  const hash = voiceHash(text, spec.voice);
  const audioPath = `tts/${hash}.mp3`;
  const alignPath = `tts/${hash}.json`;
  const local = path.join(deps.workDir, `${hash}.mp3`);

  const known = await deps.store.tts(hash);
  if (known && (await deps.storage.exists(audioPath)) && (await deps.storage.exists(alignPath))) {
    await writeFile(local, await deps.storage.download(audioPath));
    const words = JSON.parse(Buffer.from(await deps.storage.download(alignPath)).toString("utf8")) as Word[];
    return { file: local, words, durationMs: known.duration_ms, hash, cached: true, silent: false };
  }

  if (!deps.apiKey || !spec.voice.voice_id) {
    if (!deps.allowSilent) {
      throw new VoiceNotConfigured(!deps.apiKey ? "ElevenLabs is not set up: ELEVENLABS_API_KEY is missing" : "no voice chosen: set the voice in Settings → Video");
    }
    const words = estimatedWords(text);
    const seconds = (words[words.length - 1]?.end ?? 1) + 0.2;
    await ffmpeg(["-f", "lavfi", "-i", "anullsrc=r=44100:cl=mono", "-t", seconds.toFixed(3), "-c:a", "libmp3lame", "-b:a", "64k", local]);
    return { file: local, words, durationMs: Math.round(seconds * 1000), hash: `silent-${hash}`, cached: false, silent: true };
  }

  const res = await (deps.fetchImpl ?? fetch)(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(spec.voice.voice_id)}/with-timestamps?output_format=mp3_44100_128`, {
    method: "POST",
    headers: { "content-type": "application/json", "xi-api-key": deps.apiKey },
    body: JSON.stringify({
      text,
      model_id: spec.voice.model_id,
      voice_settings: { stability: spec.voice.stability, similarity_boost: spec.voice.similarity_boost, style: spec.voice.style, use_speaker_boost: true },
    }),
  });
  if (!res.ok) throw new Error(`ElevenLabs answered ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = (await res.json()) as ElevenResponse;
  if (!data.audio_base64 || !data.alignment) throw new Error("ElevenLabs sent no audio or no timings");
  const audio = Buffer.from(data.audio_base64, "base64");
  await writeFile(local, audio);
  const words = wordsFromAlignment(data.alignment);
  const probed = await probe(local).catch(() => null);
  const durationMs = Math.round(((probed?.duration ?? words[words.length - 1]?.end ?? 0) as number) * 1000);
  await deps.storage.upload(audioPath, audio, "audio/mpeg");
  await deps.storage.upload(alignPath, Buffer.from(JSON.stringify(words)), "application/json");
  await deps.store.putTts({ hash, voice_id: spec.voice.voice_id, characters: [...text].length, duration_ms: durationMs, path: audioPath });
  return { file: local, words, durationMs, hash, cached: false, silent: false };
}

/** ElevenLabs' own count of characters left this month, for the Settings page and the cap. */
export async function voiceQuota(apiKey: string, fetchImpl: typeof fetch = fetch): Promise<{ used: number; limit: number; resetsAt: string | null } | null> {
  const res = await fetchImpl("https://api.elevenlabs.io/v1/user/subscription", { headers: { "xi-api-key": apiKey } });
  if (!res.ok) return null;
  const data = (await res.json()) as { character_count?: number; character_limit?: number; next_character_count_reset_unix?: number };
  return {
    used: data.character_count ?? 0,
    limit: data.character_limit ?? 0,
    resetsAt: data.next_character_count_reset_unix ? new Date(data.next_character_count_reset_unix * 1000).toISOString() : null,
  };
}

/** For tests and the local dry run: read a file back. */
export async function readBytes(file: string): Promise<Uint8Array> {
  return new Uint8Array(await readFile(file));
}
