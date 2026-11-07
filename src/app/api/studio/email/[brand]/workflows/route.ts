import { z } from "zod/v4";
import { body, route } from "@/studio/server/api";
import { brandOf, saveWorkflow } from "@/studio/email/views";

export const dynamic = "force-dynamic";

export const POST = route<{ brand: string }>(async ({ req, ctx, params }) => saveWorkflow(ctx, brandOf(params.brand), null, await body(req, z.unknown())));
