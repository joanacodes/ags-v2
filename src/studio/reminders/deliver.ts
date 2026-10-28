/**
 * Delivering reminders, every tick. What is due goes out by its channels (in-app is the bell and the
 * Today list, which read the table; email through Resend), is marked `sent`, and a repeating reminder
 * gets its next occurrence. Between 22:00 and 07:00 Paris only urgent ones go out (a cap, a flagged
 * reply); the rest wait for the morning. A reminder is marked sent once and never sent twice.
 */
import type { AgentContext } from "../agents/context";
import type { SendEmail } from "../clients/resend";
import type { ReminderRow } from "../store/rows";
import { addDays, fromParis, parisDate, parisTime, weekdayOf, wallTime } from "../time";

/** Is a Paris time inside the quiet window (which may run over midnight)? */
export function isQuiet(now: Date, start: string, end: string): boolean {
  const t = parisTime(now);
  return start <= end ? t >= start && t < end : t >= start || t < end;
}

/** The next occurrence of a repeating reminder, at the same Paris time. */
export function nextOccurrence(r: Pick<ReminderRow, "due_at" | "repeat">): Date | null {
  if (r.repeat === "none") return null;
  const due = new Date(r.due_at);
  const date = parisDate(due);
  const time = parisTime(due);
  if (r.repeat === "daily") return fromParis(addDays(date, 1), time);
  if (r.repeat === "weekly") return fromParis(addDays(date, 7), time);
  if (r.repeat === "weekdays") {
    let next = addDays(date, 1);
    while (weekdayOf(next) === 0 || weekdayOf(next) === 6) next = addDays(next, 1);
    return fromParis(next, time);
  }
  // Monthly: the same day next month, or its last day when the month is shorter (31 January → 28 February).
  const w = wallTime(due);
  const year = w.month === 12 ? w.year + 1 : w.year;
  const month = w.month === 12 ? 1 : w.month + 1;
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const day = Math.min(w.day, last);
  return fromParis(`${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`, time);
}

export function ownerEmail(ctx: AgentContext): string | null {
  return ctx.settings.get("reminders").email ?? ctx.settings.get("global").owner_email ?? null;
}

export async function deliverReminders(ctx: AgentContext, sendEmail: SendEmail | null): Promise<{ sent: number; deferred: number; failed: number; noEmail: boolean }> {
  const { store, settings, now } = ctx;
  const conf = settings.get("reminders");
  const quiet = isQuiet(now, conf.quiet_start, conf.quiet_end);
  const due = [
    ...(await store.reminders({ statuses: ["scheduled"], dueBefore: now.toISOString(), limit: 200 })),
    ...(await store.reminders({ statuses: ["snoozed"], limit: 200 })).filter((r) => r.snoozed_until && r.snoozed_until <= now.toISOString()),
  ];
  const to = ownerEmail(ctx);
  let sent = 0;
  let deferred = 0;
  let failed = 0;
  for (const r of due) {
    const kind = conf.kinds[r.kind];
    if (!kind.on) {
      await store.updateReminder(r.id, { status: "cancelled" }, "reminders");
      continue;
    }
    if (quiet && !r.urgent) {
      deferred += 1;
      continue;
    }
    const channels = r.channels.length ? r.channels : kind.channels;
    // Without Resend or an address, email is skipped and the reminder stays in the app (the run says so).
    if (channels.includes("email") && sendEmail && to) {
      try {
        await sendEmail({ to, subject: r.title, text: emailText(r) });
      } catch (err) {
        failed += 1;
        await store.logEvent({ table: "studio_reminders", rowId: r.id, actor: "reminders", note: `email not sent: ${err instanceof Error ? err.message : String(err)}` });
        continue;
      }
    }
    await store.updateReminder(r.id, { status: "sent", sent_at: now.toISOString(), snoozed_until: null }, "reminders");
    sent += 1;
    const next = nextOccurrence(r);
    if (next) {
      await store.insertReminder({
        kind: r.kind,
        title: r.title,
        body: r.body,
        due_at: next.toISOString(),
        timezone: r.timezone,
        repeat: r.repeat,
        channels: r.channels,
        urgent: r.urgent,
        linked_table: r.linked_table,
        linked_id: r.linked_id,
        link: r.link,
        created_by: r.created_by,
        dedupe_key: `${r.dedupe_key ?? r.id}@${parisDate(next)}`,
      });
    }
  }
  return { sent, deferred, failed, noEmail: !sendEmail || !to };
}

function emailText(r: ReminderRow): string {
  // An email needs a full address: the one set, else Vercel's production domain (set by Vercel itself).
  const production = (process.env.VERCEL_PROJECT_PRODUCTION_URL ?? "").trim();
  const base = (process.env.STUDIO_BASE_URL || (production ? `https://${production}` : "")).replace(/\/$/, "");
  const link = r.link ? (r.link.startsWith("http") ? r.link : `${base}${r.link}`) : base ? `${base}/studio/today` : "";
  return [r.body ?? "", link ? `Open it: ${link}` : "", "— The Studio"].filter(Boolean).join("\n\n");
}
