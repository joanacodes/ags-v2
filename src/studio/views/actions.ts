/**
 * What the owner's taps do. Every change goes through here, so the rules live in one place: only the
 * owner approves (their id goes on the row); a piece whose text fails the gate can't be approved until
 * it is fixed; editing re-runs the gate; nothing posted is ever changed or killed.
 */
import type { AgentContext } from "../agents/context";
import { rewritePiece, writeCards } from "../agents/writers";
import { checkText } from "../gate/text";
import { gateInputOf } from "../pieces/compose";
import { mediaNeed } from "../render/need";
import { withRun } from "../run";
import type { GateChecks } from "../gate/text";
import type { CardRow, PostRow, ReminderRow } from "../store/rows";
import type { NewReminder, PostPatch } from "../store/store";
import { addDays, fromParis, parisDate } from "../time";
import { tiktokIdFromUrl } from "../outbox/tiktok";
import { sendReply, type SendResult } from "../outbox/community";

export class ActionError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

const OWNER = "owner";
const textFields = ["script", "lines", "caption", "title", "description", "tags", "slides"] as const;

export interface Outcome {
  readonly changed: number;
  readonly skipped: readonly { readonly id: string; readonly why: string }[];
}

function gateOf(ctx: AgentContext, post: PostRow, card: Pick<CardRow, "hook" | "figures" | "anchor">) {
  return checkText(gateInputOf(post, card, ctx.kit), ctx.kit, ctx.settings.get("gate").checks as GateChecks, ctx.now);
}

export async function approvePieces(ctx: AgentContext, ids: readonly string[], ownerId: string): Promise<Outcome> {
  const posts = await ctx.store.posts({ ids });
  const ok: string[] = [];
  const skipped: { id: string; why: string }[] = [];
  for (const p of posts) {
    if (p.status !== "draft" && p.status !== "failed") skipped.push({ id: p.id, why: `it is ${p.status}` });
    else if (p.gate && !p.gate.ok) skipped.push({ id: p.id, why: "it fails the gate: fix the text first" });
    else ok.push(p.id);
  }
  if (ok.length) await ctx.store.updatePosts(ok, { status: "approved", approved_by: ownerId, approved_at: ctx.now.toISOString(), error: null, retries: 0 }, OWNER);
  // A card with an approved piece is approved: the strategist's backlog and the scorecard read that.
  const cardIds = [...new Set(posts.filter((p) => ok.includes(p.id)).map((p) => p.card_id))];
  const cards = cardIds.length ? await ctx.store.cards({ ids: cardIds, statuses: ["draft"] }) : [];
  if (cards.length) await ctx.store.updateCards(cards.map((c) => c.id), { status: "approved", approved_by: ownerId, approved_at: ctx.now.toISOString() }, OWNER);
  return { changed: ok.length, skipped };
}

export async function approveCards(ctx: AgentContext, ids: readonly string[], ownerId: string): Promise<Outcome> {
  const cards = await ctx.store.cards({ ids });
  const drafts = cards.filter((c) => c.status === "draft").map((c) => c.id);
  if (drafts.length) await ctx.store.updateCards(drafts, { status: "approved", approved_by: ownerId, approved_at: ctx.now.toISOString() }, OWNER);
  const pieces = await ctx.store.posts({ cardIds: ids, statuses: ["draft"], limit: 2000 });
  const result = await approvePieces(ctx, pieces.map((p) => p.id), ownerId);
  return { changed: drafts.length + result.changed, skipped: result.skipped };
}

export async function killPieces(ctx: AgentContext, ids: readonly string[]): Promise<Outcome> {
  const posts = await ctx.store.posts({ ids });
  const ok = posts.filter((p) => p.status !== "posted" && p.status !== "killed").map((p) => p.id);
  if (ok.length) await ctx.store.updatePosts(ok, { status: "killed" }, OWNER);
  return { changed: ok.length, skipped: posts.filter((p) => !ok.includes(p.id)).map((p) => ({ id: p.id, why: `it is ${p.status}` })) };
}

export async function killCards(ctx: AgentContext, ids: readonly string[]): Promise<Outcome> {
  const cards = await ctx.store.cards({ ids });
  const ok = cards.filter((c) => c.status !== "killed").map((c) => c.id);
  if (ok.length) await ctx.store.updateCards(ok, { status: "killed" }, OWNER);
  const pieces = await ctx.store.posts({ cardIds: ids, limit: 2000 });
  const killed = await killPieces(ctx, pieces.map((p) => p.id));
  return { changed: ok.length + killed.changed, skipped: [] };
}

/** Confirm mode's second tap: these approved pieces may go out at their slots. */
export async function confirmPieces(ctx: AgentContext, ids: readonly string[], ownerId: string): Promise<Outcome> {
  const posts = await ctx.store.posts({ ids });
  const ok = posts.filter((p) => (p.status === "approved" || p.status === "rendered") && p.approved_by === ownerId).map((p) => p.id);
  if (ok.length) await ctx.store.updatePosts(ok, { confirmed_at: ctx.now.toISOString() }, OWNER);
  return { changed: ok.length, skipped: posts.filter((p) => !ok.includes(p.id)).map((p) => ({ id: p.id, why: p.approved_by === ownerId ? `it is ${p.status}` : "approve it first" })) };
}

export async function reschedulePieces(ctx: AgentContext, ids: readonly string[], at: string): Promise<Outcome> {
  if (Number.isNaN(Date.parse(at))) throw new ActionError("that isn't a date and time");
  const posts = await ctx.store.posts({ ids });
  let changed = 0;
  for (const p of posts) {
    if (p.status === "posted" || p.status === "killed") continue;
    // A piece that failed to post goes back to waiting for its new slot, its retries counted afresh.
    const patch: PostPatch = { scheduled_at: new Date(at).toISOString() };
    if (p.status === "failed" || p.status === "queued") Object.assign(patch, { status: p.approved_by ? (mediaNeed(p) && !(await ctx.store.media({ postIds: [p.id] })).length ? "approved" : "rendered") : "draft", error: null, retries: 0, platform_state: null });
    await ctx.store.updatePosts([p.id], patch, OWNER);
    changed += 1;
  }
  return { changed, skipped: [] };
}

/** Back to `approved`, so the next render picks it up; the route dispatches the render now. */
export async function rerenderPieces(ctx: AgentContext, ids: readonly string[]): Promise<Outcome> {
  const posts = await ctx.store.posts({ ids });
  const ok = posts.filter((p) => (p.status === "rendered" || p.status === "failed" || p.status === "approved") && p.approved_by && mediaNeed(p)).map((p) => p.id);
  if (ok.length) await ctx.store.updatePosts(ok, { status: "approved", error: null }, OWNER);
  return { changed: ok.length, skipped: posts.filter((p) => !ok.includes(p.id)).map((p) => ({ id: p.id, why: p.approved_by ? "it has no media to render" : "approve it first" })) };
}

export interface PieceEdit {
  readonly script?: string | null;
  readonly lines?: string[] | null;
  readonly caption?: string | null;
  readonly title?: string | null;
  readonly description?: string | null;
  readonly tags?: string[];
  readonly slides?: { heading: string; body: string }[] | null;
}

/** The owner's own edit: the gate runs again; text drawn on media sends the piece back to the renderer. */
export async function editPiece(ctx: AgentContext, id: string, edit: PieceEdit): Promise<{ post: PostRow; gateOk: boolean; failures: string[] }> {
  const post = (await ctx.store.posts({ ids: [id] }))[0];
  if (!post) throw new ActionError("no such piece", 404);
  if (post.status === "posted") throw new ActionError("a posted piece can't change: write a new one");
  const card = (await ctx.store.cards({ ids: [post.card_id] }))[0];
  if (!card) throw new ActionError("the piece's card is gone", 404);
  const next: PostRow = { ...post };
  for (const f of textFields) if (edit[f] !== undefined) (next as Record<string, unknown>)[f] = edit[f];
  const gate = gateOf(ctx, next, card);
  const drawn = edit.lines !== undefined || edit.slides !== undefined || edit.script !== undefined || (edit.title !== undefined && mediaNeed(post) === "picture");
  let status = post.status;
  if (!gate.ok && (status === "draft" || status === "approved" || status === "rendered")) status = "failed";
  else if (gate.ok && status === "failed" && post.gate && !post.gate.ok) status = post.approved_by ? "approved" : "draft";
  else if (gate.ok && drawn && status === "rendered") status = "approved";
  const patch: PostPatch = { ...Object.fromEntries(textFields.filter((f) => edit[f] !== undefined).map((f) => [f, edit[f]])), gate, status, error: gate.ok ? null : gate.failures.map((f) => f.message).join("; ") };
  await ctx.store.updatePosts([id], patch, OWNER);
  const saved = (await ctx.store.posts({ ids: [id] }))[0]!;
  return { post: saved, gateOk: gate.ok, failures: gate.failures.map((f) => `${f.check}: ${f.message}`) };
}

/** A by-hand piece the owner posted: its address, and TikTok's id from it for the numbers. */
export async function markPosted(ctx: AgentContext, id: string, url: string): Promise<void> {
  const post = (await ctx.store.posts({ ids: [id] }))[0];
  if (!post) throw new ActionError("no such piece", 404);
  if (!/^https:\/\/\S+$/.test(url.trim())) throw new ActionError("paste the post's https:// address");
  const clean = url.trim();
  await ctx.store.updatePosts([id], { status: "posted", platform_url: clean, platform_post_id: post.platform === "tiktok" ? (tiktokIdFromUrl(clean) ?? clean) : clean, posted_at: ctx.now.toISOString(), error: null }, OWNER);
  const due = await ctx.store.reminders({ statuses: ["scheduled", "sent", "snoozed"], limit: 500 });
  for (const r of due.filter((r) => r.linked_id === id)) await ctx.store.updateReminder(r.id, { status: "done" }, OWNER);
}

export async function rewrite(ctx: AgentContext, id: string, instruction: string): Promise<{ ok: boolean; message: string }> {
  if (instruction.trim().length < 3) throw new ActionError("say what to change");
  let out = { ok: false, message: "" };
  await withRun(ctx.store, { agent: "interactive", trigger: "interactive", details: { action: "rewrite", piece: id } }, async (log) => {
    const r = await rewritePiece(ctx, id, instruction, log);
    out = { ok: r.ok, message: r.message };
    return { outcome: r.ok ? "ok" : "failed", error: r.ok ? null : r.message };
  });
  return out;
}

/** The writers again for chosen cards: their unposted pieces are replaced. */
export async function rerunWriters(ctx: AgentContext, cardIds: readonly string[]): Promise<{ pieces: number; failed: number }> {
  const cards = await ctx.store.cards({ ids: cardIds });
  if (!cards.length) throw new ActionError("no such cards", 404);
  let written = { pieces: 0, failed: 0, unscheduled: 0 };
  const start = (use: "writer-en" | "writer-fr") => ({ agent: use, trigger: "interactive" as const, model: ctx.settings.model(use).model, details: { action: "re-run writers", cards: cardIds } });
  await withRun(ctx.store, start("writer-en"), async (en) => {
    await withRun(ctx.store, start("writer-fr"), async (fr) => {
      written = await writeCards(ctx, cards, { en, fr }, { replaceExisting: true });
    });
  });
  return { pieces: written.pieces, failed: written.failed };
}

export async function replyAction(ctx: AgentContext, id: string, action: "approve" | "send" | "skip" | "edit", text?: string): Promise<SendResult | { ok: true }> {
  const row = (await ctx.store.replies({ ids: [id], limit: 1 }))[0];
  if (!row) throw new ActionError("no such reply", 404);
  if (row.status === "sent") throw new ActionError("already sent");
  if (action === "skip") {
    await ctx.store.updateReply(id, { status: "skipped" }, OWNER);
    return { ok: true };
  }
  const draft = text !== undefined ? text.trim() : (row.draft_reply ?? "").trim();
  if (!draft) throw new ActionError("the reply is empty");
  if (draft.length > 1000) throw new ActionError("a reply is short: under 1,000 characters");
  await ctx.store.updateReply(id, { draft_reply: draft, status: action === "edit" ? "draft" : "approved" }, OWNER);
  if (action === "send") return sendReply(ctx, id);
  return { ok: true };
}

export type Snooze = "hour" | "evening" | "tomorrow";

export async function reminderAction(ctx: AgentContext, id: string, action: "done" | "snooze" | "cancel", snooze?: Snooze): Promise<void> {
  if (action === "done") return ctx.store.updateReminder(id, { status: "done" }, OWNER);
  if (action === "cancel") return ctx.store.updateReminder(id, { status: "cancelled" }, OWNER);
  const today = parisDate(ctx.now);
  const until =
    snooze === "hour" ? new Date(ctx.now.getTime() + 3600_000) : snooze === "evening" ? fromParis(today, "19:00") : fromParis(addDays(today, 1), "09:00");
  const at = until.getTime() <= ctx.now.getTime() ? fromParis(addDays(today, 1), "09:00") : until;
  await ctx.store.updateReminder(id, { status: "snoozed", snoozed_until: at.toISOString() }, OWNER);
}

export async function createReminder(ctx: AgentContext, input: { title: string; body?: string | null; due_at: string; repeat?: ReminderRow["repeat"]; channels?: string[]; linked_table?: string | null; linked_id?: string | null; link?: string | null }): Promise<void> {
  if (!input.title.trim()) throw new ActionError("give it a title");
  if (Number.isNaN(Date.parse(input.due_at))) throw new ActionError("when?");
  const r: NewReminder = {
    kind: "custom",
    title: input.title.trim().slice(0, 200),
    body: input.body?.trim() || null,
    due_at: new Date(input.due_at).toISOString(),
    repeat: input.repeat ?? "none",
    channels: input.channels?.length ? input.channels : ctx.settings.get("reminders").kinds.custom.channels,
    linked_table: input.linked_table ?? null,
    linked_id: input.linked_id ?? null,
    link: input.link ?? null,
    created_by: OWNER,
  };
  await ctx.store.insertReminder(r);
}
