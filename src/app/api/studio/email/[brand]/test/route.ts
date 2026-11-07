import { z } from "zod/v4";
import { body, route } from "@/studio/server/api";
import { brandOf, sendTest } from "@/studio/email/views";

export const dynamic = "force-dynamic";

/** The design on screen, sent once to the owner's test address. Never to a contact. */
export const POST = route<{ brand: string }>(async ({ req, ctx, params }) => sendTest(ctx, brandOf(params.brand), await body(req, z.unknown())));
