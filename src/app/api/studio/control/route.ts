import { z } from "zod/v4";
import { body, route } from "@/studio/server/api";
import { resendFromEnv } from "@/studio/clients/resend";
import { githubFromEnv } from "@/studio/schedule/github";
import { killSwitch, restart } from "@/studio/views/control";
import { startClock, stopClock } from "@/studio/schedule/clock";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** The kill switch and the restart beside it; the clock's start and stop. */
export const POST = route(async ({ req, ctx, url }) => {
  const input = await body(req, z.object({ action: z.enum(["kill", "restart", "clock-start", "clock-stop"]), reason: z.string().max(300).default("") }));
  // The tick is pointed at the address the Studio is open at (or STUDIO_BASE_URL): its production address.
  if (input.action === "clock-start") return startClock(ctx.store, (process.env.STUDIO_BASE_URL ?? "").trim() || url.origin);
  if (input.action === "clock-stop") return stopClock(ctx.store);
  const github = githubFromEnv(ctx.settings.get("global").branch);
  if (input.action === "kill") return killSwitch(ctx, { github, sendEmail: resendFromEnv() }, input.reason);
  return restart(ctx, { github });
});
