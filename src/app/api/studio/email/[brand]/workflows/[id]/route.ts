import { z } from "zod/v4";
import { body, route } from "@/studio/server/api";
import { brandOf, deleteWorkflow, getWorkflow, saveWorkflow } from "@/studio/email/views";

export const dynamic = "force-dynamic";

type P = { brand: string; id: string };

export const GET = route<P>(async ({ ctx, params }) => getWorkflow(ctx, brandOf(params.brand), params.id));

export const PUT = route<P>(async ({ req, ctx, params }) => saveWorkflow(ctx, brandOf(params.brand), params.id, await body(req, z.unknown())));

export const DELETE = route<P>(async ({ ctx, params }) => {
  await deleteWorkflow(ctx, brandOf(params.brand), params.id);
  return { ok: true };
});
