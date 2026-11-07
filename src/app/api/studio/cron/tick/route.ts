/**
 * The tick: called every 15 minutes by Supabase (pg_cron + pg_net) with the clock's secret, which lives
 * in Vault (schedule/clock.ts). It dispatches the workers that are due to GitHub Actions and delivers the
 * reminders. A GET does the same, so a Vercel cron (with CRON_SECRET) can stand in if the database's clock
 * is ever off.
 */
import { contextFromEnv, storesFromEnv } from "@/studio/server/context";
import { bearer } from "@/studio/server/secrets";
import { tickAuthorized } from "@/studio/schedule/clock";
import { resendFromEnv } from "@/studio/clients/resend";
import { dispatchWorker, githubFromEnv } from "@/studio/schedule/github";
import { runTick } from "@/studio/schedule/tick";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function tick(req: Request): Promise<Response> {
  try {
    // Who calls is checked before anything else is loaded.
    if (!(await tickAuthorized((await storesFromEnv()).store, bearer(req)))) return Response.json({ error: "unauthorised" }, { status: 401 });
    const ctx = await contextFromEnv("tick");
    const gh = githubFromEnv(ctx.settings.get("global").branch);
    const result = await runTick(ctx, { dispatch: gh ? (worker, inputs) => dispatchWorker(gh, worker, inputs) : null, sendEmail: resendFromEnv() });
    return Response.json({ outcome: result.outcome, error: result.error, dispatched: result.log.details["dispatched"] ?? [], reminders: result.log.details["reminders"] ?? null });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

export const POST = tick;
export const GET = tick;
