import { z } from "zod/v4";
import { body, HttpError, route } from "@/studio/server/api";
import { Http } from "@/studio/outbox/http";
import { connectBluesky, connectMastodon } from "@/studio/outbox/oauth";
import { testConnection } from "@/studio/outbox/publish";
import { disconnect, saveToken } from "@/studio/outbox/tokens";
import { CONNECTIONS, CONNECTION_OF, type ConnectionKey } from "@/studio/outbox/types";
import { PLATFORMS } from "@/studio/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const keySchema = z.enum(CONNECTIONS);

export const POST = route<{ key: string }>(async ({ req, ctx, params }) => {
  const key = keySchema.parse(params.key) as ConnectionKey;
  const input = await body(
    req,
    z.discriminatedUnion("action", [
      z.object({ action: z.literal("bluesky"), handle: z.string().min(3).max(253), password: z.string().min(8).max(100), service: z.string().url().optional() }),
      z.object({ action: z.literal("mastodon"), instance: z.string().min(3).max(253), token: z.string().min(10).max(200) }),
      z.object({ action: z.literal("test"), platform: z.string().optional() }),
      z.object({ action: z.literal("disconnect") }),
    ]),
  );
  if (input.action === "disconnect") {
    await disconnect(ctx.store, key);
    return { ok: true };
  }
  if (input.action === "test") {
    const platform = PLATFORMS.find((p) => p === input.platform && CONNECTION_OF[p] === key) ?? PLATFORMS.find((p) => CONNECTION_OF[p] === key);
    if (!platform) throw new HttpError(400, "this connection posts nowhere");
    return testConnection(ctx, platform);
  }
  // Signing in only reads (a session, the account's name): a dry Http is enough and stays safe.
  const http = new Http(false);
  try {
    const made = input.action === "bluesky" ? await connectBluesky(http, input) : await connectMastodon(http, input);
    if ((input.action === "bluesky" && key !== "bluesky") || (input.action === "mastodon" && key !== "mastodon")) throw new HttpError(400, "wrong form for this connection");
    await saveToken(ctx.store, key, made.token, ctx.now, made.label);
    return { ok: true, account: made.label };
  } catch (err) {
    if (err instanceof HttpError) throw err;
    throw new HttpError(400, `couldn't sign in: ${err instanceof Error ? err.message : String(err)}`);
  }
});
