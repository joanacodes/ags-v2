import { z } from "zod/v4";
import { body, route } from "@/studio/server/api";
import { brandOf, draftDesign } from "@/studio/email/views";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** "Write it for me": a draft from the owner's brief, shown in the designer; nothing is saved or sent. */
export const POST = route<{ brand: string }>(async ({ req, ctx, params }) => draftDesign(ctx, brandOf(params.brand), await body(req, z.unknown())));
