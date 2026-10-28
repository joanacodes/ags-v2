/**
 * The tick: called every 15 minutes by Supabase (pg_cron + pg_net) with CRON_SECRET. It dispatches
 * the workers that are due to GitHub Actions and delivers the reminders. A GET with the same secret does
 * the same, so a Vercel cron can stand in if the database's clock is ever off.
 */
import { contextFromEnv } from "@/studio/server/context";
import { bearer, sameSecret } from "@/studio/server/secrets";
import { resendFromEnv } from "@/studio/clients/resend";
import { dispatchWorker, githubFromEnv } from "@/studio/schedule/github";
import { runTick } from "@/studio/schedule/tick";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function tick(req: Request): Promise<Response> {
  const secret = (process.env.CRON_SECRET ?? "").trim();
  if (!secret) return Response.json({ error: "CRON_SECRET isn't set" }, { status: 503 });
  if (!sameSecret(bearer(req), secret)) return Response.json({ error: "unauthorised" }, { status: 401 });
  try {
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
