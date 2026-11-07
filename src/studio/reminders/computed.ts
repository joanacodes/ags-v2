/**
 * The reminders the Studio works out for itself on every tick, each written once (a dedupe key per
 * occasion): the Sunday approval at 19:00 and again at 21:00, the replies at 18:30, a token's expiry
 * seven days and one day ahead, a cap at 80%, a calendar event two days before and on the morning, and
 * a sky event the evening before (off by default).
 */
import type { AgentContext } from "../agents/context";
import { CONNECTION_LABELS, type ConnectionKey } from "../outbox/types";
import type { NewReminder } from "../store/store";
import type { ReminderKind } from "../types";
import { addDays, fromParis, monthStart, nextWeek, parisDate, parisTime, parisWeek, weekdayOf, weekStart } from "../time";

export async function computeReminders(ctx: AgentContext): Promise<number> {
  const { store, settings, now } = ctx;
  const kinds = settings.get("reminders").kinds;
  const today = parisDate(now);
  const time = parisTime(now);
  const made: NewReminder[] = [];
  const add = (kind: ReminderKind, r: Omit<NewReminder, "kind" | "channels" | "created_by">) => {
    if (kinds[kind].on) made.push({ ...r, kind, channels: kinds[kind].channels, created_by: "studio" });
  };

  // Sunday: the coming week's cards and pieces still to review.
  if (weekdayOf(today) === 0 && time >= "19:00") {
    const week = nextWeek(parisWeek(now));
    const cards = await store.cards({ weeks: [week], statuses: ["draft"] });
    if (cards.length > 0) {
      const pieces = await store.posts({ cardIds: cards.map((c) => c.id), statuses: ["draft"] });
      const minutes = Math.max(5, Math.round(cards.length * 0.5 + pieces.length / 6));
      const second = time >= "21:00";
      add("approve-week", {
        title: second ? "The week still waits for you" : "Sunday's week is waiting",
        body: `${cards.length} cards, ${pieces.length} pieces, about ${minutes} minutes.`,
        due_at: fromParis(today, second ? "21:00" : "19:00").toISOString(),
        link: `/studio/library?tab=week&week=${week}`,
        dedupe_key: `approve-week:${week}:${second ? "21" : "19"}`,
      });
    }
  }

  // 18:30: replies drafted and waiting, flagged ones first.
  if (time >= "18:30") {
    const waiting = (await store.replies({ statuses: ["draft"], limit: 500 })).filter((r) => r.draft_reply && r.klass !== "spam");
    if (waiting.length > 0) {
      const flagged = waiting.filter((r) => r.flag !== "none").length;
      add("replies-due", {
        title: `${waiting.length} replies to look at`,
        body: flagged ? `${flagged} flagged for you first.` : "Drafts are ready to approve or edit.",
        due_at: fromParis(today, "18:30").toISOString(),
        link: "/studio/library?tab=replies",
        dedupe_key: `replies-due:${today}`,
      });
    }
  }

  // Tokens: seven days and one day before the owner must reconnect.
  for (const c of await store.connections()) {
    if (!c.expires_at || c.status === "disconnected") continue;
    const left = Date.parse(c.expires_at) - now.getTime();
    const label = CONNECTION_LABELS[c.platform as ConnectionKey] ?? c.platform;
    for (const days of [7, 1]) {
      if (left > 0 && left <= days * 86400_000) {
        add("connection-expiring", {
          title: `Reconnect ${label}`,
          body: `The connection stops on ${parisDate(new Date(c.expires_at))}. One tap in Settings renews it.`,
          due_at: now.toISOString(),
          link: "/studio/settings?section=connections",
          dedupe_key: `connection:${c.platform}:${c.expires_at.slice(0, 10)}:${days}`,
        });
        break;
      }
    }
  }

  // Caps at 80%: the week's model spend, the month's voice minutes.
  const cap = settings.get("global").weekly_cap_usd;
  const spent = await store.spendSince(weekStart(now).toISOString());
  if (cap > 0 && spent >= 0.8 * cap) {
    add("cap-near", {
      title: `Model spend at ${Math.round((spent / cap) * 100)}% of the week's cap`,
      body: `$${spent.toFixed(2)} of $${cap.toFixed(2)}. At the cap, agent runs stop until Monday; raise it in Settings if the week needs more.`,
      due_at: now.toISOString(),
      urgent: true,
      link: "/studio/settings?section=models",
      dedupe_key: `cap-near:model:${parisWeek(now)}`,
    });
  }
  const minutesCap = settings.get("render-video").minutes_cap;
  const used = (await store.ttsSince(monthStart(now).toISOString())).durationMs / 60000;
  if (minutesCap > 0 && used >= 0.8 * minutesCap) {
    add("cap-near", {
      title: `Voice minutes at ${Math.round((used / minutesCap) * 100)}% of the month's cap`,
      body: `${used.toFixed(1)} of ${minutesCap} minutes. At the cap, videos stop rendering until the 1st.`,
      due_at: now.toISOString(),
      urgent: true,
      link: "/studio/settings?section=models",
      dedupe_key: `cap-near:voice:${today.slice(0, 7)}`,
    });
  }

  // Calendar events: two days before (09:00) and the morning of (08:00).
  for (const e of await store.calendar({ from: today, to: addDays(today, 3) })) {
    if (!e.remind) continue;
    const before = addDays(e.date, -2);
    if (today === before && time >= "09:00") add("calendar-event", { title: `In two days: ${e.event}`, body: e.note, due_at: fromParis(before, "09:00").toISOString(), link: "/studio/library?tab=sky", linked_table: "studio_calendar", linked_id: e.id, dedupe_key: `calendar:${e.id}:2d` });
    if (today === e.date && time >= "08:00") add("calendar-event", { title: `Today: ${e.event}`, body: e.note, due_at: fromParis(e.date, "08:00").toISOString(), link: "/studio/library?tab=sky", linked_table: "studio_calendar", linked_id: e.id, dedupe_key: `calendar:${e.id}:0d` });
  }

  // Sky events: the evening before at 18:00.
  if (kinds["sky-event"].on && time >= "18:00") {
    for (const s of await store.sky({ from: addDays(today, 1), to: addDays(today, 2) })) {
      add("sky-event", { title: `Tomorrow: ${s.event}`, body: s.time_paris ? `${s.time_paris} Paris.` : null, due_at: fromParis(today, "18:00").toISOString(), link: "/studio/library?tab=sky", linked_table: "studio_sky", linked_id: s.id, dedupe_key: `sky:${s.id}` });
    }
  }

  let written = 0;
  for (const r of made) if (await store.insertReminder(r)) written += 1;
  return written;
}
