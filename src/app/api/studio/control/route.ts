import { z } from "zod/v4";
import { body, route } from "@/studio/server/api";
import { resendFromEnv } from "@/studio/clients/resend";
import { githubFromEnv } from "@/studio/schedule/github";
import { killSwitch, restart } from "@/studio/views/control";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** The kill switch and the restart beside it. */
export const POST = route(async ({ req, ctx }) => {
  const input = await body(req, z.object({ action: z.enum(["kill", "restart"]), reason: z.string().max(300).default("") }));
  const github = githubFromEnv(ctx.settings.get("global").branch);
  if (input.action === "kill") return killSwitch(ctx, { github, sendEmail: resendFromEnv() }, input.reason);
  return restart(ctx, { github });
});
