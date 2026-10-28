import { z } from "zod/v4";
import { body, route } from "@/studio/server/api";
import { checkKey } from "@/studio/keys";

export const dynamic = "force-dynamic";

/** Ask the service whether the key works: one read, never a write. */
export const POST = route(async ({ req }) => {
  const input = await body(req, z.object({ env: z.string().min(2).max(60) }));
  return checkKey(input.env);
});
