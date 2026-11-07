import { route } from "@/studio/server/api";

export const dynamic = "force-dynamic";
/** Reset layout: the Map goes back to the default positions computed by depth and order. */
export const DELETE = route(async ({ ctx }) => {
  await ctx.store.resetNodePositions();
  return { ok: true };
});
