import { z } from "zod/v4";
import { body, HttpError, route } from "@/studio/server/api";
import { nextWeek, parisWeek } from "@/studio/time";
import { PILLARS } from "@/studio/types";

export const dynamic = "force-dynamic";

export const PATCH = route(async ({ req, ctx }) => {
  const input = await body(req, z.object({ id: z.string(), text: z.string().min(3).max(300).optional(), retired: z.boolean().optional(), pillar: z.enum(PILLARS).optional() }));
  await ctx.store.updateHook(input.id, { ...(input.text ? { text: input.text } : {}), ...(input.retired !== undefined ? { retired: input.retired } : {}), ...(input.pillar ? { pillar: input.pillar } : {}) });
  return { ok: true };
});

/** Add hooks to the bank, or make a draft card from one for next week. */
export const POST = route(async ({ req, ctx }) => {
  const input = await body(req, z.discriminatedUnion("action", [z.object({ action: z.literal("add"), text: z.string().min(3).max(300), pillar: z.enum(PILLARS), language: z.enum(["en", "fr"]) }), z.object({ action: z.literal("card"), id: z.string() })]));
  if (input.action === "add") {
    await ctx.store.addHooks([{ text: input.text, pillar: input.pillar, language: input.language, source: "owner" }]);
    return { ok: true };
  }
  const hook = (await ctx.store.hooks()).find((h) => h.id === input.id);
  if (!hook) throw new HttpError(404, "no such hook");
  const [card] = await ctx.store.insertCards([{ week: nextWeek(parisWeek(ctx.now)), pillar: hook.pillar, language: hook.language, idea: hook.text, hook: hook.text, points: [hook.text], figures: [], cta: "test", formats: ["video", "text"], hook_id: hook.id, status: "draft", reason: "made from the hook bank by the owner", created_by: "owner" }], "owner");
  return { id: card?.id ?? null };
});
