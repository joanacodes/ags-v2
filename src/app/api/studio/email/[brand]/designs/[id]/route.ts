import { z } from "zod/v4";
import { body, route } from "@/studio/server/api";
import { brandOf, deleteDesign, duplicateDesign, getDesign, saveDesign } from "@/studio/email/views";

export const dynamic = "force-dynamic";

type P = { brand: string; id: string };

export const GET = route<P>(async ({ ctx, params }) => getDesign(ctx, brandOf(params.brand), params.id));

export const PUT = route<P>(async ({ req, ctx, params }) => saveDesign(ctx, brandOf(params.brand), params.id, await body(req, z.unknown())));

export const DELETE = route<P>(async ({ ctx, params }) => {
  await deleteDesign(ctx, brandOf(params.brand), params.id);
  return { ok: true };
});

export const POST = route<P>(async ({ req, ctx, params }) => {
  await body(req, z.object({ action: z.literal("duplicate") }));
  return duplicateDesign(ctx, brandOf(params.brand), params.id);
});
