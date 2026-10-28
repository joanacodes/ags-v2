/** Shapes the screens share: a piece as one line, a reply as one line, a reminder as one line. */
import type { CardRow, MediaRow, PostRow, ReminderRow, ReplyRow } from "../store/rows";
import { FORMAT_LABELS, PLATFORM_LABELS, type Platform } from "../types";

export interface PieceLine {
  readonly id: string;
  readonly cardId: string;
  readonly platform: Platform;
  readonly platformLabel: string;
  readonly format: PostRow["format"];
  readonly formatLabel: string;
  readonly language: PostRow["language"];
  readonly status: PostRow["status"];
  readonly scheduledAt: string | null;
  readonly postedAt: string | null;
  readonly headline: string;
  readonly caption: string | null;
  readonly url: string | null;
  readonly error: string | null;
  readonly byHand: boolean;
  readonly confirmed: boolean;
  readonly dryRun: boolean;
  readonly gateOk: boolean | null;
  readonly gateFailures: readonly string[];
  readonly media: readonly { readonly id: string; readonly kind: MediaRow["kind"] }[];
}

export function pieceLine(p: PostRow, card: CardRow | undefined, media: readonly MediaRow[], byHand: boolean): PieceLine {
  return {
    id: p.id,
    cardId: p.card_id,
    platform: p.platform,
    platformLabel: PLATFORM_LABELS[p.platform],
    format: p.format,
    formatLabel: FORMAT_LABELS[p.format],
    language: p.language,
    status: p.status,
    scheduledAt: p.scheduled_at,
    postedAt: p.posted_at,
    headline: (p.title ?? card?.hook ?? p.caption ?? p.script ?? "").replace(/\s+/g, " ").slice(0, 140),
    caption: p.caption ?? p.description ?? null,
    url: p.platform_url,
    error: p.error,
    byHand,
    confirmed: !!p.confirmed_at,
    dryRun: !!p.platform_post_id?.startsWith("dry-run:"),
    gateOk: p.gate ? p.gate.ok : null,
    gateFailures: (p.gate?.failures ?? []).map((f) => `${f.check}: ${f.message}`),
    media: media.filter((m) => m.post_id === p.id).map((m) => ({ id: m.id, kind: m.kind })),
  };
}

export interface ReplyLine {
  readonly id: string;
  readonly platform: string;
  readonly author: string | null;
  readonly theirText: string;
  readonly theirLang: string | null;
  readonly receivedAt: string;
  readonly klass: ReplyRow["klass"];
  readonly draft: string | null;
  readonly flag: ReplyRow["flag"];
  readonly flagReason: string | null;
  readonly status: ReplyRow["status"];
  readonly pieceId: string | null;
}

export function replyLine(r: ReplyRow): ReplyLine {
  return { id: r.id, platform: r.platform, author: r.author_handle, theirText: r.their_text, theirLang: r.their_lang, receivedAt: r.received_at, klass: r.klass, draft: r.draft_reply, flag: r.flag, flagReason: r.flag_reason, status: r.status, pieceId: r.post_id };
}

export interface ReminderLine {
  readonly id: string;
  readonly kind: ReminderRow["kind"];
  readonly title: string;
  readonly body: string | null;
  readonly dueAt: string;
  readonly urgent: boolean;
  readonly link: string | null;
  readonly status: ReminderRow["status"];
  readonly createdBy: string;
}

export function reminderLine(r: ReminderRow): ReminderLine {
  return { id: r.id, kind: r.kind, title: r.title, body: r.body, dueAt: r.status === "snoozed" && r.snoozed_until ? r.snoozed_until : r.due_at, urgent: r.urgent, link: r.link, status: r.status, createdBy: r.created_by };
}

/** Flagged replies first (distress, then the rest), then the oldest. */
export function replyOrder(a: ReplyRow, b: ReplyRow): number {
  const rank = (r: ReplyRow) => (r.flag === "distress" ? 0 : r.flag === "under18" ? 1 : r.flag !== "none" ? 2 : 3);
  return rank(a) - rank(b) || a.received_at.localeCompare(b.received_at);
}
