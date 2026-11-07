/**
 * The Video studio's server half: a piece's spec and an estimated timeline (150 words a minute) for the
 * preview before any voice exists; the voice itself, cached by hash and shared with the final render;
 * saving the owner's changes back to the piece; a hand-made video as a new card and piece; and sending a
 * rendered video on to other networks as drafts.
 */
import { tmpdir } from "node:os";
import path from "node:path";
import type { AgentContext } from "../agents/context";
import { voiceCap } from "../caps";
import { VIDEO_TEMPLATES } from "../templates/registry";
import { buildSpec, splitLines, videoSpecSchema, type VideoSpec } from "../video/spec";
import { buildTimeline, estimatedWords, type Timeline } from "../video/timeline";
import { speak, VoiceNotConfigured } from "../video/tts";
import { PLATFORMS, type Language, type Pillar, type Platform } from "../types";
import { ActionError, editPiece } from "./actions";
import { checkText, describeFailures, type GateChecks } from "../gate/text";
import { gateInputOf } from "../pieces/compose";
import { templateById } from "../templates/registry";

export interface VideoState {
  readonly pieceId: string | null;
  readonly cardId: string | null;
  readonly status: string | null;
  readonly approved: boolean;
  readonly spec: VideoSpec;
  readonly timeline: Timeline;
  readonly estimated: boolean;
  readonly templates: typeof VIDEO_TEMPLATES;
  readonly voiceReady: boolean;
}

export function previewTimeline(spec: VideoSpec, words = estimatedWords(spec.script)): Timeline {
  return buildTimeline(spec.lines, words, { perSegment: spec.captions.words_per_segment, disclosure: spec.overlays.disclosure });
}

export async function videoState(ctx: AgentContext, pieceId: string | null): Promise<VideoState> {
  const video = ctx.settings.get("render-video");
  if (!pieceId) {
    const spec = buildSpec({ script: "", lines: [], language: "en", spec: null }, { hook: "", anchor: null, figures: [], sky_date: null }, ctx.kit, video);
    return { pieceId: null, cardId: null, status: null, approved: false, spec, timeline: previewTimeline(spec), estimated: true, templates: VIDEO_TEMPLATES, voiceReady: !!video.voice_id && !!process.env.ELEVENLABS_API_KEY };
  }
  const post = (await ctx.store.posts({ ids: [pieceId] }))[0];
  if (!post) throw new ActionError("no such piece", 404);
  const card = (await ctx.store.cards({ ids: [post.card_id] }))[0];
  if (!card) throw new ActionError("the piece's card is gone", 404);
  const spec = buildSpec(post, card, ctx.kit, video);
  return { pieceId: post.id, cardId: card.id, status: post.status, approved: !!post.approved_by, spec, timeline: previewTimeline(spec), estimated: true, templates: VIDEO_TEMPLATES, voiceReady: !!video.voice_id && !!process.env.ELEVENLABS_API_KEY };
}

/** The real voice for the preview: the same cached call the render will reuse, counted against the cap. */
export async function previewVoice(ctx: AgentContext, input: unknown): Promise<{ audioUrl: string | null; timeline: Timeline; cached: boolean; message: string | null }> {
  const spec = videoSpecSchema.parse(input);
  const cap = await voiceCap(ctx.store, ctx.settings, ctx.now);
  if (!cap.ok) return { audioUrl: null, timeline: previewTimeline(spec), cached: false, message: cap.reason };
  try {
    const voice = await speak(spec.script, spec, { store: ctx.store, storage: ctx.storage, apiKey: (process.env.ELEVENLABS_API_KEY ?? "").trim() || null, allowSilent: false, workDir: path.join(tmpdir(), "studio-tts") });
    const audioUrl = await ctx.storage.signedUrl(`tts/${voice.hash}.mp3`, 3600);
    return { audioUrl, timeline: previewTimeline(spec, voice.words), cached: voice.cached, message: null };
  } catch (err) {
    if (err instanceof VoiceNotConfigured) return { audioUrl: null, timeline: previewTimeline(spec), cached: false, message: err.message };
    throw err;
  }
}

/** The owner's spec back onto the piece: the words through the gate (as any edit), the look in its spec. */
export async function saveVideo(ctx: AgentContext, pieceId: string, input: unknown): Promise<{ gateOk: boolean; failures: string[] }> {
  const spec = videoSpecSchema.parse(input);
  const post = (await ctx.store.posts({ ids: [pieceId] }))[0];
  if (!post) throw new ActionError("no such piece", 404);
  if (post.format !== "video" && post.format !== "long_video") throw new ActionError("that piece isn't a video");
  const lines = spec.lines.length ? spec.lines : splitLines(spec.script);
  const edited = await editPiece(ctx, pieceId, { script: spec.script, lines });
  const stored = (edited.post.spec ?? {}) as Record<string, unknown>;
  await ctx.store.updatePosts([pieceId], { spec: { ...stored, template: spec.template, statements: spec.statements ?? stored["statements"] ?? null, sky: spec.sky ?? stored["sky"] ?? null, steps: spec.steps ?? stored["steps"] ?? null } }, "owner");
  return { gateOk: edited.gateOk, failures: edited.failures };
}

/** A video made by hand: a card and its piece, as drafts the owner approves like any other. */
export async function newVideo(ctx: AgentContext, input: { platform: Platform; language: Language; pillar: Pillar; hook: string; script: string; template: string; week: string }): Promise<{ pieceId: string; cardId: string }> {
  const [card] = await ctx.store.insertCards([{ week: input.week, pillar: input.pillar, language: input.language, idea: input.hook, hook: input.hook, points: [input.hook], figures: [], cta: "test", formats: ["video"], status: "draft", reason: "made by hand in the Video studio", created_by: "owner" }], "owner");
  if (!card) throw new ActionError("the card couldn't be made", 500);
  const [post] = await ctx.store.insertPosts([{ card_id: card.id, platform: input.platform, format: "video", language: input.language, script: input.script, lines: splitLines(input.script), caption: input.hook, disclosure: true, spec: { template: input.template }, status: "draft", updated_by: "owner" }], "owner");
  if (!post) throw new ActionError("the piece couldn't be made", 500);
  return { pieceId: post.id, cardId: card.id };
}

/** "Send to outbox as draft for…": the rendered video, its file shared, as a draft piece on each network. */
export async function sendVideoTo(ctx: AgentContext, pieceId: string, platforms: readonly string[]): Promise<{ made: number }> {
  const post = (await ctx.store.posts({ ids: [pieceId] }))[0];
  if (!post) throw new ActionError("no such piece", 404);
  const media = await ctx.store.media({ postIds: [pieceId] });
  if (!media.some((m) => m.kind === "video")) throw new ActionError("render it first");
  const wanted = PLATFORMS.filter((p) => platforms.includes(p) && p !== post.platform && ctx.kit.platforms[p]?.formats.includes("video"));
  const made = await ctx.store.insertPosts(
    wanted.map((p) => ({ card_id: post.card_id, platform: p, format: post.format, language: post.language, script: post.script, lines: post.lines, caption: post.caption, title: post.title, description: post.description, tags: post.tags, spec: post.spec, disclosure: post.disclosure, status: "draft" as const, updated_by: "owner" })),
    "owner",
  );
  for (const p of made) for (const m of media) await ctx.store.insertMedia({ post_id: p.id, kind: m.kind, path: m.path, bytes: m.bytes, duration_ms: m.duration_ms, width: m.width, height: m.height, sha256: m.sha256, meta: { ...m.meta, shared_from: pieceId } });
  return { made: made.length };
}

/** The gate, live in the Video studio: the words as the writer's gate reads them, plus the video's own limits. */
export async function checkVideo(ctx: AgentContext, pieceId: string | null, input: unknown): Promise<{ ok: boolean; checks: { name: string; ok: boolean; detail: string }[] }> {
  const spec = videoSpecSchema.parse(input);
  const post = pieceId ? (await ctx.store.posts({ ids: [pieceId] }))[0] : undefined;
  const card = post ? (await ctx.store.cards({ ids: [post.card_id] }))[0] : undefined;
  const timeline = previewTimeline(spec);
  const tpl = templateById(spec.template);
  const longest = Math.max(0, ...spec.lines.map((l) => l.split(/\s+/).filter(Boolean).length));
  const checks: { name: string; ok: boolean; detail: string }[] = [
    { name: "Duration", ok: timeline.duration >= 8 && timeline.duration <= spec.output.max_seconds, detail: `${timeline.duration.toFixed(1)} s estimated; ${spec.output.max_seconds} s at most` },
    { name: "Lines", ok: spec.lines.length > 0 && spec.lines.length <= (tpl?.maxLines ?? 8) && longest <= (tpl?.lineWords ?? 6), detail: `${spec.lines.length} lines, the longest ${longest} words (${tpl?.lineWords ?? 6} at most)` },
    { name: "Disclosure", ok: spec.overlays.disclosure, detail: spec.overlays.disclosure ? "the AI-voice frame closes the video" : "the AI-voice frame is off" },
  ];
  if (tpl?.needs.includes("statements")) checks.push({ name: "Statements", ok: (spec.statements?.length ?? 0) === 3, detail: `${spec.statements?.length ?? 0} of 3 statements` });
  if (spec.template === "figure-card") checks.push({ name: "Figure", ok: !!spec.figure?.source, detail: spec.figure ? `“${spec.figure.value}”, from ${spec.figure.source}` : "no figure: a figure without a source is not a figure" });
  const words = gateInputOf(
    { platform: post?.platform ?? "instagram", format: "video", language: spec.language, script: spec.script, lines: spec.lines, caption: post?.caption ?? null, title: post?.title ?? null, description: post?.description ?? null, tags: post?.tags ?? [], slides: null, disclosure: true, spec: { statements: spec.statements } },
    card ?? { hook: spec.lines[0] ?? "", figures: [], anchor: null },
    ctx.kit,
  );
  const gate = checkText(words, ctx.kit, ctx.settings.get("gate").checks as GateChecks, ctx.now);
  checks.push({ name: "Words", ok: gate.ok, detail: gate.ok ? "banned terms, figures, predictions, keyword, language: all clear" : describeFailures(gate).join("; ") });
  return { ok: checks.every((c) => c.ok), checks };
}
