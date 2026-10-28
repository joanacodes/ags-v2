import { z } from "zod/v4";
import { body, HttpError, route } from "@/studio/server/api";
import { cardDetail } from "@/studio/views/detail";

export const dynamic = "force-dynamic";

export const GET = route<{ id: string }>(async ({ ctx, params }) => {
  const d = await cardDetail(ctx, params.id);
  if (!d) throw new HttpError(404, "no such card");
  return d;
});

/** The owner's edit of a card's words; its pieces are re-written with "Re-run writers". */
export const PATCH = route<{ id: string }>(async ({ req, ctx, params }) => {
  const edit = await body(req, z.object({ hook: z.string().min(3).max(300).optional(), idea: z.string().min(3).max(1000).optional(), points: z.array(z.string().min(1).max(400)).min(1).max(6).optional(), cta: z.string().min(1).max(200).optional() }));
  const card = (await ctx.store.cards({ ids: [params.id] }))[0];
  if (!card) throw new HttpError(404, "no such card");
  if (card.status === "used" || card.status === "killed") throw new HttpError(409, `the card is ${card.status}`);
  await ctx.store.updateCards([params.id], edit, "owner");
  return { ok: true };
});

/** Duplicate as a variant: the same idea with a new hook, for next week, linked to its parent. */
export const POST = route<{ id: string }>(async ({ req, ctx, params }) => {
  const input = await body(req, z.object({ action: z.literal("variant"), hook: z.string().min(3).max(300), week: z.string().regex(/^\d{4}-W\d{2}$/) }));
  const card = (await ctx.store.cards({ ids: [params.id] }))[0];
  if (!card) throw new HttpError(404, "no such card");
  const [made] = await ctx.store.insertCards(
    [{ week: input.week, pillar: card.pillar, language: card.language, idea: card.idea, hook: input.hook, points: card.points, figures: card.figures, cta: card.cta, formats: card.formats, anchor: card.anchor, src: card.src, parent: card.id, hook_id: card.hook_id, status: "draft", reason: "a variant the owner made", created_by: "owner" }],
    "owner",
  );
  return { id: made?.id ?? null };
});
