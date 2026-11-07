import { z } from "zod/v4";
import { body, route } from "@/studio/server/api";
import { brandOf, deleteContact, updateContact } from "@/studio/email/views";

export const dynamic = "force-dynamic";

type P = { brand: string; id: string };

export const PATCH = route<P>(async ({ req, ctx, params }) => updateContact(ctx, brandOf(params.brand), params.id, await body(req, z.unknown())));

export const DELETE = route<P>(async ({ ctx, params }) => {
  await deleteContact(ctx, brandOf(params.brand), params.id);
  return { ok: true };
});
