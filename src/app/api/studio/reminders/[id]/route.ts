import { z } from "zod/v4";
import { body, route } from "@/studio/server/api";
import { reminderAction } from "@/studio/views/actions";

export const dynamic = "force-dynamic";

export const POST = route<{ id: string }>(async ({ req, ctx, params }) => {
  const input = await body(req, z.object({ action: z.enum(["done", "snooze", "cancel"]), snooze: z.enum(["hour", "evening", "tomorrow"]).optional() }));
  await reminderAction(ctx, params.id, input.action, input.snooze);
  return { ok: true };
});
