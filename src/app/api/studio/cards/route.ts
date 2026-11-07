import { z } from "zod/v4";
import { body, ids, route } from "@/studio/server/api";
import { approveCards, killCards, rerunWriters } from "@/studio/views/actions";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export const POST = route(async ({ req, ctx, ownerId }) => {
  const input = await body(req, z.object({ action: z.enum(["approve", "kill", "rerun"]), ids }));
  if (input.action === "approve") return approveCards(ctx, input.ids, ownerId);
  if (input.action === "kill") return killCards(ctx, input.ids);
  return rerunWriters(ctx, input.ids.slice(0, 10));
});
