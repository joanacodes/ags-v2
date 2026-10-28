/**
 * The VideoSpec: the only input the engine takes. Built from a piece and the settings by `buildSpec`,
 * edited by hand in the Video studio, validated here either way.
 */
import { z } from "zod/v4";
import { VIDEO_TEMPLATES } from "../templates/registry";
import type { CardRow, PostRow } from "../store/rows";
import type { Kit } from "../kit/schema";
import type { NodeSettings } from "../settings";
import { words } from "../gate/text";

export const stepSchema = z.discriminatedUnion("do", [
  z.object({ do: z.literal("goto"), url: z.string().url() }),
  z.object({ do: z.literal("click"), selector: z.string() }),
  z.object({ do: z.literal("type"), selector: z.string(), text: z.string() }),
  z.object({ do: z.literal("wait"), seconds: z.number().min(0).max(20) }),
  z.object({ do: z.literal("scroll"), y: z.number() }),
  z.object({ do: z.literal("highlight"), selector: z.string(), seconds: z.number().min(0).max(20).default(2) }),
  z.object({ do: z.literal("zoom"), selector: z.string(), seconds: z.number().min(0).max(20).default(2) }),
  z.object({ do: z.literal("say"), text: z.string().min(1) }),
]);
export type Step = z.infer<typeof stepSchema>;

export const videoSpecSchema = z.object({
  template: z.enum(VIDEO_TEMPLATES.map((t) => t.id) as [string, ...string[]]),
  ratio: z.enum(["9:16", "1:1", "16:9"]).default("9:16"),
  language: z.enum(["en", "fr"]),
  script: z.string().min(1),
  lines: z.array(z.string()).min(1),
  emphasis: z.string().nullable().default(null),
  anchor: z.string().nullable().default(null),
  statements: z.array(z.string()).max(3).nullable().default(null),
  figure: z.object({ value: z.string(), label: z.string(), source: z.string() }).nullable().default(null),
  sky: z.object({ when: z.string(), event: z.string(), house: z.string().default("") }).nullable().default(null),
  steps: z.array(stepSchema).nullable().default(null),
  voice: z.object({
    voice_id: z.string().nullable(),
    model_id: z.string().default("eleven_multilingual_v2"),
    stability: z.number().min(0).max(1).default(0.6),
    similarity_boost: z.number().min(0).max(1).default(0.8),
    style: z.number().min(0).max(1).default(0.1),
  }),
  background: z.object({ kind: z.literal("loop"), src: z.string().default("meadow-loop-tall"), speed: z.number().min(0.25).max(2).default(0.8) }),
  captions: z.object({ words_per_segment: z.number().int().min(1).max(6).default(3), max_lines: z.number().int().min(1).max(3).default(2), style: z.literal("cream-bar").default("cream-bar") }),
  overlays: z.object({ disclosure: z.boolean().default(true) }),
  disclosure_text: z.string().default(""),
  audio: z.object({ music: z.string().nullable().default(null), music_db: z.number().default(-22), loudness_lufs: z.number().default(-14) }),
  output: z.object({ fps: z.number().int().default(30), max_seconds: z.number().int().default(45), srt: z.boolean().default(true), thumbnail_at: z.enum(["hook", "middle"]).default("hook") }),
});
export type VideoSpec = z.infer<typeof videoSpecSchema>;

/** Split a script into on-screen lines of six words at most, at sentence and clause ends first. */
export function splitLines(script: string, maxWords = 6): string[] {
  const out: string[] = [];
  for (const sentence of script.split(/(?<=[.!?…])\s+/)) {
    const clauses = sentence.split(/(?<=[,;:—])\s+/);
    for (const clause of clauses) {
      const ws = words(clause);
      for (let i = 0; i < ws.length; i += maxWords) {
        const chunk = ws.slice(i, i + maxWords);
        // Never leave one word alone on the last line of a clause: give it the previous line's company.
        if (chunk.length === 1 && out.length && words(out[out.length - 1]!).length < maxWords + 2 && i > 0) out[out.length - 1] += ` ${chunk[0]}`;
        else out.push(chunk.join(" "));
      }
    }
  }
  return out.filter((l) => l.trim());
}

/** The spec a piece renders with: its words, its template, the owner's voice and video settings. */
export function buildSpec(post: Pick<PostRow, "script" | "lines" | "language" | "spec">, card: Pick<CardRow, "hook" | "anchor" | "figures" | "sky_date">, kit: Kit, video: NodeSettings<"render-video">): VideoSpec {
  const stored = (post.spec ?? {}) as Record<string, unknown>;
  const script = (post.script ?? "").trim();
  const lines = post.lines?.length ? post.lines : splitLines(script);
  const figure = card.figures.find((f) => f.verified);
  return videoSpecSchema.parse({
    template: typeof stored["template"] === "string" ? stored["template"] : video.default_template,
    ratio: "9:16",
    language: post.language,
    script,
    lines,
    emphasis: card.anchor ?? (post.language === "fr" ? "thème natal" : "birth chart"),
    anchor: card.anchor,
    statements: Array.isArray(stored["statements"]) ? stored["statements"] : null,
    figure: figure ? { value: figure.value, label: figure.label, source: figure.source } : null,
    sky: stored["sky"] ?? (card.sky_date ? { when: card.sky_date, event: card.hook, house: "" } : null),
    steps: Array.isArray(stored["steps"]) ? stored["steps"] : null,
    voice: { voice_id: video.voice_id, model_id: video.voice_model, stability: video.stability, similarity_boost: video.similarity_boost, style: video.style },
    background: { kind: "loop", src: video.background, speed: video.background_speed },
    captions: { words_per_segment: 3, max_lines: 2, style: "cream-bar" },
    overlays: { disclosure: true },
    disclosure_text: post.language === "fr" ? kit.disclosure.frame_fr : kit.disclosure.frame_en,
    audio: { music: video.music ? "music-bed" : null, music_db: video.music_level_db, loudness_lufs: video.loudness_lufs },
    output: { fps: 30, max_seconds: video.max_seconds, srt: true, thumbnail_at: "hook" },
  });
}
