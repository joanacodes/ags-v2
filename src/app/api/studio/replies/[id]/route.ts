import { z } from "zod/v4";
import { body, route } from "@/studio/server/api";
import { replyAction } from "@/studio/views/actions";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Approve, edit, skip, or send now (the owner's tap is the only thing that ever sends a reply). */
export const POST = route<{ id: string }>(async ({ req, ctx, params }) => {
  const input = await body(req, z.object({ action: z.enum(["approve", "send", "skip", "edit"]), text: z.string().max(1000).optional() }));
  return replyAction(ctx, params.id, input.action, input.text);
});
