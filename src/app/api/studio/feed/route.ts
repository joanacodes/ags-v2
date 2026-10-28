import { randomBytes } from "node:crypto";
import { route } from "@/studio/server/api";
import { saveNodeSettings } from "@/studio/views/control";

export const dynamic = "force-dynamic";

/** The calendar feed's address; a new token cuts off any calendar that had the old one. */
export const POST = route(async ({ ctx, url }) => {
  const token = randomBytes(24).toString("base64url");
  await saveNodeSettings(ctx, "reminders", { feed_token: token });
  const base = (process.env.STUDIO_BASE_URL ?? url.origin).replace(/\/$/, "");
  return { url: `${base}/api/studio/reminders.ics?token=${token}` };
});

export const GET = route(async ({ ctx, url }) => {
  const token = ctx.settings.get("reminders").feed_token;
  const base = (process.env.STUDIO_BASE_URL ?? url.origin).replace(/\/$/, "");
  return { url: token ? `${base}/api/studio/reminders.ics?token=${token}` : null };
});
