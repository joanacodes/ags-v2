import { z } from "zod/v4";
import { body, route } from "@/studio/server/api";
import { createReminder } from "@/studio/views/actions";
import { reminderLine } from "@/studio/views/shared";
import { REPEATS } from "@/studio/types";

export const dynamic = "force-dynamic";

/** The bell: what is due now, and what is coming in the next week. */
export const GET = route(async ({ ctx }) => {
  const now = ctx.now.toISOString();
  const rows = await ctx.store.reminders({ statuses: ["scheduled", "sent", "snoozed"], dueBefore: new Date(ctx.now.getTime() + 7 * 86400_000).toISOString(), limit: 300 });
  const lines = rows.map(reminderLine);
  return { due: lines.filter((r) => r.dueAt <= now), upcoming: lines.filter((r) => r.dueAt > now).sort((a, b) => a.dueAt.localeCompare(b.dueAt)) };
});

export const POST = route(async ({ req, ctx }) => {
  const input = await body(req, z.object({ title: z.string().min(1).max(200), body: z.string().max(2000).nullable().optional(), due_at: z.string(), repeat: z.enum(REPEATS).optional(), channels: z.array(z.enum(["in_app", "email", "push"])).optional(), linked_table: z.string().max(40).nullable().optional(), linked_id: z.string().max(64).nullable().optional(), link: z.string().max(500).nullable().optional() }));
  await createReminder(ctx, input);
  return { ok: true };
});
