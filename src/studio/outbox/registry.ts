/**
 * One place that turns a platform into its client: the token from the vault, the guarded Http, the
 * kit's boards for Pinterest, the TikTok mode. Whether the Http is live is decided here and only here.
 */
import type { Kit } from "../kit/schema";
import type { StudioSettings } from "../settings";
import type { PostRow } from "../store/rows";
import type { StudioStore } from "../store/store";
import type { Platform } from "../types";
import { blueskyClient } from "./bluesky";
import { Http, type Fetch } from "./http";
import { mastodonClient } from "./mastodon";
import { facebookClient, instagramClient } from "./meta";
import { pinterestClient } from "./pinterest";
import { POSTLY_PLATFORMS, postlyClient } from "./postly";
import { threadsClient } from "./threads";
import { tiktokClient } from "./tiktok";
import { loadToken, saveToken } from "./tokens";
import { CONNECTION_LABELS, CONNECTION_OF, type ClientDeps, type ConnectionKey, type PlatformClient } from "./types";
import { xClient } from "./x";
import { youtubeClient } from "./youtube";

export interface ClientEnv {
  readonly kit: Kit;
  readonly settings: StudioSettings;
}

export function buildClient(platform: Platform, deps: ClientDeps, env: ClientEnv): PlatformClient | null {
  switch (platform) {
    case "instagram":
      return instagramClient(deps);
    case "facebook":
      return facebookClient(deps);
    case "threads":
      return threadsClient(deps);
    case "youtube":
      return youtubeClient(deps);
    case "pinterest":
      return pinterestClient(deps, (lang) => env.kit.platforms.pinterest?.boards?.[lang === "fr" ? "fr" : "en"] ?? []);
    case "bluesky":
      return blueskyClient(deps);
    case "mastodon":
      return mastodonClient(deps);
    case "x":
      return xClient(deps);
    case "tiktok":
      return tiktokClient(deps, env.settings.postingMode("tiktok") === "api" ? "direct" : "inbox");
    default:
      return null;
  }
}

/**
 * The draft-only guard. A write reaches a platform only when STUDIO_LIVE is "true" and the piece was
 * approved by the owner (approved_by equal to STUDY_OWNER_USER_ID). Anything else is a dry run.
 */
export function mayWrite(post: Pick<PostRow, "approved_by" | "status">, ownerId: string | null, live: boolean): boolean {
  return live && !!ownerId && post.approved_by === ownerId && post.status !== "killed" && post.status !== "draft";
}

export type ClientResult = { readonly client: PlatformClient; readonly http: Http } | { readonly error: string };

/** The client for a platform, built on a token from the vault, with a live or a dry Http. */
export async function clientFor(store: StudioStore, platform: Platform, env: ClientEnv & { live: boolean; now: Date; fetchImpl?: Fetch }): Promise<ClientResult> {
  const key = CONNECTION_OF[platform] as ConnectionKey | undefined;
  if (!key) return { error: `${platform} has no API: it is posted by hand` };
  const token = await loadToken(store, key);
  if (!token) return { error: `${CONNECTION_LABELS[key]} isn't connected: connect it in Settings → Connections` };
  const http = new Http(env.live, env.fetchImpl);
  const deps: ClientDeps = { http, token, saveToken: (t) => saveToken(store, key, t, env.now) };
  const client = buildClient(platform, deps, env);
  if (!client) return { error: `${platform} has no client` };
  return { client, http };
}

/**
 * The client a piece is posted with: Postly's when the owner chose it for this network, else the
 * network's own. Comments and numbers always use `clientFor`, the network's own app, when connected.
 */
export async function publishClientFor(store: StudioStore, platform: Platform, env: ClientEnv & { live: boolean; now: Date; fetchImpl?: Fetch; wait?: (ms: number) => Promise<void> }): Promise<ClientResult> {
  if (env.settings.postingMode(platform) !== "postly") return clientFor(store, platform, env);
  if (!POSTLY_PLATFORMS.has(platform)) return { error: `Postly doesn't post to ${platform}` };
  const apiKey = (process.env.POSTLY_API_KEY ?? "").trim();
  if (!apiKey) return { error: "Postly is chosen but its key isn't set: paste it in Settings → Keys" };
  const p = env.settings.get("postly");
  if (!p.workspace_id) return { error: "Postly is chosen but no workspace is picked: Settings → Connections → Postly" };
  const channel = p.channels[platform];
  if (!channel) return { error: `Postly has no ${platform} channel picked: Settings → Connections → Postly` };
  const http = new Http(env.live, env.fetchImpl);
  return { client: postlyClient(platform, http, { apiKey, workspaceId: p.workspace_id, channelId: channel.id }, env.wait), http };
}
