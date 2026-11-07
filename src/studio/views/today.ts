/**
 * Today: what the owner has to do, in the order it matters (confirm what goes out next, post what goes
 * by hand, answer replies, the reminders, what failed), then the day's queue hour by hour.
 */
import type { AgentContext } from "../agents/context";
import { addDays, fromParis, nextWeek, parisDate, parisWeek } from "../time";
import { health, type Health } from "./health";
import { pieceLine, reminderLine, replyLine, replyOrder, type PieceLine, type ReminderLine, type ReplyLine } from "./shared";

export interface TodayView {
  readonly now: string;
  readonly date: string;
  readonly health: Health;
  readonly toConfirm: readonly PieceLine[];
  readonly byHand: readonly PieceLine[];
  readonly replies: readonly ReplyLine[];
  readonly reminders: readonly ReminderLine[];
  readonly failed: readonly PieceLine[];
  readonly timeline: readonly PieceLine[];
  readonly week: { readonly week: string; readonly cards: number; readonly pieces: number };
}

export async function todayView(ctx: AgentContext): Promise<TodayView> {
  const { store, settings, now } = ctx;
  const date = parisDate(now);
  const dayStart = fromParis(date, "00:00").toISOString();
  const dayEnd = fromParis(addDays(date, 1), "00:00").toISOString();
  const tomorrowNoon = fromParis(addDays(date, 1), "12:00").toISOString();
  const [h, today, upcoming, queued, failed, replies, reminders] = await Promise.all([
    health(ctx),
    store.posts({ scheduledFrom: dayStart, scheduledTo: dayEnd, limit: 500 }),
    store.posts({ statuses: ["approved", "rendered"], scheduledFrom: now.toISOString(), scheduledTo: tomorrowNoon, limit: 500 }),
    store.posts({ statuses: ["queued"], limit: 200 }),
    store.posts({ statuses: ["failed"], scheduledFrom: new Date(now.getTime() - 7 * 86400_000).toISOString(), limit: 200 }),
    store.replies({ statuses: ["draft", "approved"], limit: 200 }),
    store.reminders({ statuses: ["scheduled", "sent", "snoozed"], dueBefore: now.toISOString(), limit: 100 }),
  ]);
  const all = [...today, ...upcoming, ...queued, ...failed];
  const cardIds = [...new Set(all.map((p) => p.card_id))];
  const [cards, media] = await Promise.all([store.cards({ ids: cardIds }), store.media({ postIds: [...new Set(all.map((p) => p.id))] })]);
  const byId = new Map(cards.map((c) => [c.id, c]));
  const line = (p: (typeof all)[number]) => pieceLine(p, byId.get(p.card_id), media, settings.postingMode(p.platform) !== "api");
  const confirmMode = settings.get("global").scheduling_mode === "confirm";

  const week = nextWeek(parisWeek(now));
  const draftCards = await store.cards({ weeks: [week], statuses: ["draft"] });
  const draftPieces = draftCards.length ? await store.posts({ cardIds: draftCards.map((c) => c.id), statuses: ["draft"] }) : [];

  return {
    now: now.toISOString(),
    date,
    health: h,
    toConfirm: confirmMode ? upcoming.filter((p) => !p.confirmed_at && settings.postingMode(p.platform) === "api").map(line).sort(bySlot) : [],
    byHand: queued.filter((p) => settings.postingMode(p.platform) !== "api" || p.by_hand).map(line).sort(bySlot),
    replies: replies.filter((r) => r.draft_reply && r.klass !== "spam").sort(replyOrder).map(replyLine),
    reminders: reminders.filter((r) => r.status !== "snoozed" || (r.snoozed_until ?? "") <= now.toISOString()).map(reminderLine).sort((a, b) => Number(b.urgent) - Number(a.urgent) || a.dueAt.localeCompare(b.dueAt)),
    failed: failed.map(line).sort(bySlot),
    timeline: today.filter((p) => p.status !== "killed").map(line).sort(bySlot),
    week: { week, cards: draftCards.length, pieces: draftPieces.length },
  };
}

const bySlot = (a: PieceLine, b: PieceLine) => (a.scheduledAt ?? "").localeCompare(b.scheduledAt ?? "");

