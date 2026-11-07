import { z } from "zod/v4";
import { body, route } from "@/studio/server/api";
import { brandOf, emailOverview, saveBrandSettings } from "@/studio/email/views";

export const dynamic = "force-dynamic";

/** One brand's email space: its settings, what sending still needs, its designs, workflows and contact counts. */
export const GET = route<{ brand: string }>(async ({ ctx, params }) => emailOverview(ctx, brandOf(params.brand)));

export const PUT = route<{ brand: string }>(async ({ req, ctx, params }) => saveBrandSettings(ctx, brandOf(params.brand), await body(req, z.unknown())));
