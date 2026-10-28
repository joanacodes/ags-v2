/**
 * The reminders as a calendar the owner's phone subscribes to. The address carries a long random token
 * (Settings → Reminders shows it, and can change it), because a phone's calendar can't sign in.
 */
import { contextFromEnv } from "@/studio/server/context";
import { sameSecret } from "@/studio/server/secrets";
import { remindersIcs } from "@/studio/reminders/ics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<Response> {
  const token = new URL(req.url).searchParams.get("token");
  const ctx = await contextFromEnv("interactive");
  const expected = ctx.settings.get("reminders").feed_token;
  if (!expected || !sameSecret(token, expected)) return new Response("Not found", { status: 404 });
  const from = new Date(ctx.now.getTime() - 7 * 86400_000).toISOString();
  const to = new Date(ctx.now.getTime() + 60 * 86400_000).toISOString();
  const rows = await ctx.store.reminders({ dueAfter: from, dueBefore: to, statuses: ["scheduled", "sent", "snoozed"], limit: 1000 });
  const base = (process.env.STUDIO_BASE_URL ?? new URL(req.url).origin).replace(/\/$/, "");
  return new Response(remindersIcs(rows, base, ctx.now), { headers: { "content-type": "text/calendar; charset=utf-8", "cache-control": "private, max-age=300" } });
}
