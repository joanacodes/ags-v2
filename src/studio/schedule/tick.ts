/**
 * The tick, every 15 minutes: Supabase's pg_cron calls POST /api/cron/tick with a secret, and this
 * decides what is due. Each worker's schedule lives in its node's settings (Paris time), so the owner
 * changes a schedule in a drawer and the next tick obeys, without a deploy. A worker is due when one of
 * its scheduled moments fell between the last tick and now; the publish worker is due whenever a piece's
 * slot (or a by-hand piece's reminder) falls in the coming window. Due workers are dispatched to GitHub
 * Actions; reminders are worked out and delivered here, on Vercel, in the same call.
 */
import type { AgentContext } from "../agents/context";
import type { SendEmail } from "../clients/resend";
import type { WorkerId } from "../nodes";
import { BY_HAND_LEAD_MINUTES, retryDue } from "../outbox/publish";
import { computeReminders } from "../reminders/computed";
import { deliverReminders } from "../reminders/deliver";
import { mediaNeed } from "../render/need";
import { withRun } from "../run";
import type { StudioSettings } from "../settings";
import type { StudioStore } from "../store/store";
import { describeParis } from "../time";
import { dueBetween, parseCron } from "./cron";

/** Each scheduled worker's cron, read from its node's settings; null when the node is off. */
export function schedules(settings: StudioSettings): { worker: WorkerId; cron: string }[] {
  const out: { worker: WorkerId; cron: string }[] = [];
  const push = (worker: WorkerId, on: boolean, cron: string) => on && out.push({ worker, cron });
  push("strategist", settings.get("strategist").enabled, settings.get("strategist").schedule);
  push("community", settings.get("community").enabled, settings.get("community").schedule);
  push("analyst", settings.get("analyst").enabled, settings.get("analyst").schedule);
  push("metrics", settings.get("input-metrics").enabled, settings.get("input-metrics").schedule);
  push("render", settings.get("render-video").enabled || settings.get("render-pictures").enabled, settings.get("render-video").schedule);
  push("sources", settings.get("input-site").enabled, settings.get("input-site").schedule);
  push("sky", settings.get("input-site").enabled, settings.get("input-site").sky_schedule);
  push("maintenance", true, settings.get("maintenance").schedule);
  return out;
}

export function scheduledDue(settings: StudioSettings, from: Date, to: Date): { worker: WorkerId; at: Date }[] {
  const out: { worker: WorkerId; at: Date }[] = [];
  for (const s of schedules(settings)) {
    try {
      const at = dueBetween(parseCron(s.cron), from, to, 1)[0];
      if (at) out.push({ worker: s.worker, at });
    } catch {
      // An invalid schedule can't be saved from a drawer; one typed into the table by hand is skipped.
    }
  }
  return out;
}

/** Is anything for the outbox to do in the coming window? */
export async function publishDue(store: StudioStore, settings: StudioSettings, now: Date): Promise<boolean> {
  const outbox = settings.get("outbox");
  if (!outbox.enabled) return false;
  const until = new Date(now.getTime() + (outbox.window_minutes + BY_HAND_LEAD_MINUTES) * 60_000).toISOString();
  const ready = (await store.posts({ statuses: ["rendered", "approved"], scheduledTo: until, limit: 200 })).filter((p) => p.status === "rendered" || mediaNeed(p) === null);
  if (ready.length) return true;
  return (await store.posts({ statuses: ["failed"], scheduledTo: until, limit: 200 })).some((p) => retryDue(p, now, outbox));
}

/** A tick missed for longer than this is reported: the scheduler itself has stalled. */
const STALL_MINUTES = 60;
/** After an outage, schedules are caught up for at most this long, so a stall doesn't unleash a week. */
const CATCH_UP_HOURS = 6;

export interface TickDeps {
  readonly dispatch: ((worker: WorkerId, inputs?: { trigger?: string }) => Promise<void>) | null;
  readonly sendEmail: SendEmail | null;
}

export async function runTick(ctx: AgentContext, deps: TickDeps) {
  const { store, settings, now } = ctx;
  const last = (await store.runs({ agent: "tick", limit: 1 }))[0];
  return withRun(store, { agent: "tick", trigger: "tick" }, async (log) => {
    const lastAt = last ? new Date(last.started_at) : new Date(now.getTime() - 15 * 60_000);
    const gap = (now.getTime() - lastAt.getTime()) / 60_000;
    if (last && gap > STALL_MINUTES) {
      await store.insertReminder({
        kind: "tick-stalled",
        title: "The scheduler stopped for a while",
        body: `No tick between ${describeParis(lastAt)} and ${describeParis(now)}. What was due in the last ${CATCH_UP_HOURS} hours has been caught up; anything older waits for its next slot.`,
        due_at: now.toISOString(),
        channels: settings.get("reminders").kinds["tick-stalled"].channels,
        created_by: "tick",
        dedupe_key: `tick-stalled:${lastAt.toISOString().slice(0, 13)}`,
      });
      log.note(`the previous tick was ${Math.round(gap)} minutes ago`);
    }
    const from = new Date(Math.max(lastAt.getTime(), now.getTime() - CATCH_UP_HOURS * 3600_000));

    const dispatched: string[] = [];
    if (settings.get("global").paused) log.note("paused by the kill switch: nothing is dispatched, reminders still go out");
    else {
      const due = scheduledDue(settings, from, now).map((d) => d.worker);
      if (await publishDue(store, settings, now)) due.push("publish");
      for (const worker of [...new Set(due)]) {
        if (!deps.dispatch) {
          log.note(`${worker} is due, but GITHUB_STUDIO_TOKEN isn't set: nothing can be dispatched`);
          continue;
        }
        try {
          await deps.dispatch(worker, { trigger: "tick" });
          dispatched.push(worker);
        } catch (err) {
          log.note(`${worker}: not dispatched (${err instanceof Error ? err.message : String(err)})`);
        }
      }
    }
    const computed = await computeReminders(ctx);
    const delivered = await deliverReminders(ctx, deps.sendEmail);
    if (delivered.noEmail && delivered.sent > 0) log.note("reminders went to the app only: RESEND_API_KEY, STUDIO_EMAIL_FROM or the owner's address is missing");
    log.details["dispatched"] = dispatched;
    log.details["reminders"] = { computed, ...delivered };
    if (dispatched.length) log.note(`dispatched: ${dispatched.join(", ")}`);
    return { outcome: "ok" as const };
  });
}
