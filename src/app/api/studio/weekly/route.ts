import { z } from "zod/v4";
import { body, route } from "@/studio/server/api";
import { parisWeek } from "@/studio/time";

export const dynamic = "force-dynamic";

/** Friday's numbers only the owner knows: her hours, the DMs, the ad spend. */
export const GET = route(async ({ ctx, url }) => {
  const week = url.searchParams.get("week") ?? parisWeek(ctx.now);
  return { week, inputs: await ctx.store.weeklyInputs(week) };
});

export const PUT = route(async ({ req, ctx }) => {
  const input = await body(req, z.object({ week: z.string().regex(/^\d{4}-W\d{2}$/), owner_hours: z.number().min(0).max(168).nullable(), dm_count: z.number().int().min(0).max(100000).nullable(), ad_spend_gbp: z.number().min(0).max(100000).nullable().optional(), note: z.string().max(2000).nullable().optional() }));
  const existing = await ctx.store.weeklyInputs(input.week);
  const manual = { ...((existing?.manual ?? {}) as Record<string, unknown>) };
  if (input.ad_spend_gbp !== undefined) manual["ad_spend_gbp"] = input.ad_spend_gbp;
  await ctx.store.putWeeklyInputs({ week: input.week, owner_hours: input.owner_hours, dm_count: input.dm_count, manual, note: input.note ?? existing?.note ?? null });
  return { ok: true };
});
