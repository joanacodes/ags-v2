/** The health strip above every screen: live or dry, the caps, the clock, the queue, the failures. */
import type { AgentContext } from "../agents/context";
import { isLive } from "../agents/context";
import type { WorkerId } from "../nodes";
import { nextRun, parseCron } from "../schedule/cron";
import { schedules } from "../schedule/tick";
import { monthStart, weekStart } from "../time";

export interface Health {
  readonly live: boolean;
  readonly ownerSet: boolean;
  readonly paused: boolean;
  readonly mode: "confirm" | "direct";
  readonly spend: { readonly spent: number; readonly cap: number };
  readonly voice: { readonly minutes: number; readonly cap: number };
  readonly lastTick: string | null;
  readonly tickLate: boolean;
  readonly next: { readonly worker: WorkerId; readonly at: string } | null;
  readonly queued: number;
  readonly failed: number;
  readonly remindersDue: number;
}

export async function health(ctx: AgentContext): Promise<Health> {
  const { store, settings, now } = ctx;
  const [spent, voice, ticks, queued, failed, due] = await Promise.all([
    store.spendSince(weekStart(now).toISOString()),
    store.ttsSince(monthStart(now).toISOString()),
    store.runs({ agent: "tick", limit: 1 }),
    store.posts({ statuses: ["queued"], limit: 500 }),
    store.posts({ statuses: ["failed"], scheduledFrom: new Date(now.getTime() - 7 * 86400_000).toISOString(), limit: 500 }),
    store.reminders({ statuses: ["scheduled", "sent", "snoozed"], dueBefore: now.toISOString(), limit: 500 }),
  ]);
  let next: Health["next"] = null;
  for (const s of schedules(settings)) {
    try {
      const at = nextRun(parseCron(s.cron), now);
      if (at && (!next || at.toISOString() < next.at)) next = { worker: s.worker, at: at.toISOString() };
    } catch {
      // an unreadable schedule is shown as such in Settings
    }
  }
  const lastTick = ticks[0]?.started_at ?? null;
  return {
    live: isLive(),
    ownerSet: !!ctx.ownerId,
    paused: settings.get("global").paused,
    mode: settings.get("global").scheduling_mode,
    spend: { spent, cap: settings.get("global").weekly_cap_usd },
    voice: { minutes: voice.durationMs / 60000, cap: settings.get("render-video").minutes_cap },
    lastTick,
    tickLate: !lastTick || now.getTime() - Date.parse(lastTick) > 40 * 60_000,
    next,
    queued: queued.length,
    failed: failed.length,
    remindersDue: due.filter((r) => r.status !== "snoozed" || (r.snoozed_until ?? "") <= now.toISOString()).length,
  };
}

