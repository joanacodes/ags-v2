import { z } from "zod/v4";
import { body, HttpError, route } from "@/studio/server/api";
import { Http, PlatformError } from "@/studio/outbox/http";
import { POSTLY_API, POSTLY_PLATFORMS } from "@/studio/outbox/postly";
import { testConnection } from "@/studio/outbox/publish";
import { saveNodeSettings } from "@/studio/views/control";
import { PLATFORM_LABELS, type Platform } from "@/studio/types";

export const dynamic = "force-dynamic";

interface Workspace {
  readonly id: string;
  readonly name: string;
}
interface Channel {
  readonly id: string;
  readonly name: string;
  readonly platform: string;
}

const platforms = () => [...POSTLY_PLATFORMS].map((p) => ({ id: p, label: PLATFORM_LABELS[p] }));

/**
 * Settings → Connections → Postly: the workspaces the key reaches and, for the one picked, its channels,
 * read live from Postly (reads only). What the owner picked is in the `postly` settings.
 */
export const GET = route(async ({ ctx }) => {
  const saved = ctx.settings.get("postly");
  const modes = Object.fromEntries([...POSTLY_PLATFORMS].map((p) => [p, ctx.settings.postingMode(p)]));
  const apiKey = (process.env.POSTLY_API_KEY ?? "").trim();
  if (!apiKey) return { keySet: false, saved, modes, platforms: platforms(), workspaces: [], channels: [], error: null };
  const http = new Http(false);
  const headers = { "X-API-Key": apiKey, Accept: "application/json" };
  try {
    const ws = await http.get<{ data?: { _id?: string; name?: string }[] }>(`${POSTLY_API}/workspaces`, headers);
    const workspaces: Workspace[] = (ws.data ?? []).filter((w) => w._id).map((w) => ({ id: String(w._id), name: w.name ?? String(w._id) }));
    let channels: Channel[] = [];
    if (saved.workspace_id) {
      const so = await http.get<{ data?: { channel_id?: string; id?: string; name?: string; target?: string; platform?: string }[] }>(`${POSTLY_API}/workspaces/${encodeURIComponent(saved.workspace_id)}/socials`, headers);
      channels = (so.data ?? [])
        .map((c) => ({ id: String(c.channel_id ?? c.id ?? ""), name: c.name ?? "", platform: String(c.target ?? c.platform ?? "") }))
        .filter((c) => c.id && POSTLY_PLATFORMS.has(c.platform as Platform));
    }
    return { keySet: true, saved, modes, platforms: platforms(), workspaces, channels, error: null };
  } catch (err) {
    const error = err instanceof PlatformError ? `Postly answered ${err.status}: ${err.message}` : err instanceof Error ? err.message : String(err);
    return { keySet: true, saved, modes, platforms: platforms(), workspaces: [], channels: [], error };
  }
});

const channel = z.object({ id: z.string().min(1).max(100), name: z.string().max(200) });

/** Save the workspace and, per network, its channel. */
export const PUT = route(async ({ req, ctx }) => {
  const input = await body(req, z.object({ workspace_id: z.string().min(1).max(100).nullable(), workspace_name: z.string().max(200).nullable(), channels: z.record(z.string(), channel) }));
  const unknown = Object.keys(input.channels).filter((p) => !POSTLY_PLATFORMS.has(p as Platform));
  if (unknown.length) throw new HttpError(400, `Postly doesn't post to ${unknown.join(", ")} for the Studio`);
  const saved = await saveNodeSettings(ctx, "postly", input);
  if (!saved.ok) throw new HttpError(400, saved.problems.join("; "));
  return { ok: true };
});

/** Test in dry run through Postly: a real piece, stopped at its first write, the request logged. */
export const POST = route(async ({ req, ctx }) => {
  const input = await body(req, z.object({ action: z.literal("test"), platform: z.string() }));
  if (!POSTLY_PLATFORMS.has(input.platform as Platform)) throw new HttpError(400, `Postly doesn't post to ${input.platform}`);
  if (ctx.settings.postingMode(input.platform as Platform) !== "postly") throw new HttpError(400, `${PLATFORM_LABELS[input.platform as Platform]} isn't set to post through Postly`);
  const r = await testConnection(ctx, input.platform as Platform);
  return { ok: r.ok, message: r.message };
});
