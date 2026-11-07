/**
 * Postly, a posting service with one API key for many networks (openapi.postly.ai, the owner's account).
 * Its own apps passed TikTok's, YouTube's and Pinterest's reviews, so a piece it posts is public where an
 * app of the owner's own would be held private. The owner picks it per network in Settings →
 * Connections; comments and numbers still come from a network's own app when one is connected.
 *
 * Every write goes through the guarded Http: in a dry run the first upload is recorded and stopped, like
 * any other client. Postly answers "enqueued", not "posted": `confirmDeliveries` reads its activity
 * afterwards and turns a failed delivery into a failed piece with Postly's reason.
 */
import type { PostRow } from "../store/rows";
import type { Platform } from "../types";
import type { Http } from "./http";
import { mediaOf, type PlatformClient, type PublishInput, type Published } from "./types";

export const POSTLY_API = "https://openapi.postly.ai/v1";
export const POSTLY_PREFIX = "postly:";
export const isPostlyId = (id: string | null | undefined) => !!id && id.startsWith(POSTLY_PREFIX);

/** The networks Postly posts to that the Studio writes for (Postly's own names are the same). */
export const POSTLY_PLATFORMS: ReadonlySet<Platform> = new Set<Platform>(["instagram", "facebook", "threads", "tiktok", "youtube", "pinterest", "bluesky", "x"]);

export interface PostlyTarget {
  readonly apiKey: string;
  readonly workspaceId: string;
  readonly channelId: string;
}

type Media = { url: string; type: string };

interface Upload {
  readonly data?: { url?: string; type?: string; status?: string; idempotency_key?: string; retry_after_seconds?: number };
}

const headers = (apiKey: string) => ({ "X-API-Key": apiKey, Accept: "application/json" });

/**
 * Hand a file to Postly from its signed address. Postly may finish later (202): the same idempotency
 * key then asks how it went, so a retry never stores the file twice.
 */
async function upload(http: Http, t: PostlyTarget, url: string, name: string, key: string, wait: (ms: number) => Promise<void>): Promise<Media> {
  const first = await http.write<Upload>("POST", `${POSTLY_API}/files/upload-from-url`, {
    headers: { ...headers(t.apiKey), Prefer: "respond-async", "Idempotency-Key": key },
    json: { url, file_name: name, workspace_id: t.workspaceId },
    summary: { file_name: name, workspace_id: t.workspaceId },
  });
  let data = first.data;
  for (let i = 0; i < 40 && !(data?.url && data.status !== "processing"); i++) {
    await wait(Math.min(15, Math.max(2, data?.retry_after_seconds ?? 5)) * 1000);
    data = (await http.write<Upload>("POST", `${POSTLY_API}/files/upload-status`, { headers: headers(t.apiKey), json: { idempotency_key: key } })).data;
  }
  if (!data?.url) throw new Error(`Postly did not finish storing ${name}`);
  return { url: data.url, type: data.type ?? (name.endsWith(".mp4") ? "video/mp4" : "image/png") };
}

const extension = (path: string) => path.slice(path.lastIndexOf("."));

/** The piece's files, in the order the network shows them. */
function filesOf(post: PostRow, media: PublishInput["media"]) {
  if (post.format === "video" || post.format === "long_video") {
    const video = mediaOf(media, "video")[0];
    if (!video) throw new Error("no rendered video");
    return { files: [video], thumbnail: mediaOf(media, "thumbnail")[0] ?? null };
  }
  if (post.format === "text") return { files: [], thumbnail: null };
  const images = mediaOf(media, "image");
  if (post.format === "carousel") {
    if (images.length < 2) throw new Error("a carousel needs at least two rendered slides");
    return { files: images.slice(0, 10), thumbnail: null };
  }
  if (!images[0]) throw new Error("no rendered picture");
  return { files: [images[0]], thumbnail: null };
}

/** What each network needs beyond the text and the files, in Postly's terms. */
export function platformSettings(platform: Platform, post: PostRow, link: string | null, thumbnailUrl: string | null): Record<string, unknown> {
  const video = post.format === "video" || post.format === "long_video";
  switch (platform) {
    case "instagram":
      return { identifier: "instagram", share_to_feed: post.format !== "story", share_as_reel: video, share_as_story: post.format === "story" };
    case "facebook":
      return { identifier: "facebook", share_to_feed: post.format !== "story" && !video, share_as_reel: video, share_as_story: post.format === "story" };
    case "tiktok":
      // The voice is a clone: TikTok asks for AI-generated content to say so.
      return { identifier: "tiktok", privacy_level: "PUBLIC_TO_EVERYONE", is_aigc: post.disclosure, title: (post.title ?? "").slice(0, 90) };
    case "youtube":
      return {
        identifier: "youtube",
        title: (post.title ?? post.caption ?? "").slice(0, 100),
        description: (post.description ?? post.caption ?? "").slice(0, 4900),
        tags: post.tags.map((t) => t.replace(/^#/, "")).slice(0, 15),
        privacy: "Public",
        made_for_kids: false,
        notify_subscribers: true,
        ...(thumbnailUrl ? { thumbnail_url: thumbnailUrl } : {}),
      };
    case "pinterest":
      return { identifier: "pinterest", title: (post.title ?? "").slice(0, 100), description: (post.description ?? post.caption ?? "").slice(0, 500), ...(link ? { destination_url: link } : {}) };
    default:
      return { identifier: platform };
  }
}

export function postlyClient(platform: Platform, http: Http, target: PostlyTarget, wait: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms))): PlatformClient {
  return {
    platform,
    async publish(input: PublishInput): Promise<Published> {
      const { post } = input;
      const { files, thumbnail } = filesOf(post, input.media);
      const media: Media[] = [];
      for (const [i, f] of files.entries()) media.push(await upload(http, target, await input.signedUrl(f.path), `${post.id}-${i + 1}${extension(f.path)}`, `studio-${f.id}`, wait));
      const thumb = thumbnail && platform === "youtube" ? await upload(http, target, await input.signedUrl(thumbnail.path), `${post.id}-cover${extension(thumbnail.path)}`, `studio-${thumbnail.id}`, wait) : null;
      const link = ((post.spec ?? {}) as { link?: string }).link ?? null;
      const text = platform === "pinterest" || platform === "youtube" ? (post.description ?? post.caption ?? "") : (post.caption ?? "");
      const res = await http.write<{ data?: { _id?: string } }>("POST", `${POSTLY_API}/posts`, {
        headers: headers(target.apiKey),
        json: {
          workspace: target.workspaceId,
          target_platforms: target.channelId,
          text,
          ...(media.length ? { media } : {}),
          platform_posts: [{ identifier: platform, settings: platformSettings(platform, post, link, thumb?.url ?? null) }],
          use_publishing_presets: false,
          labels: ["the-studio", post.language],
        },
      });
      const id = res.data?._id;
      if (!id) throw new Error("Postly took the post but gave no id back");
      return { id: `${POSTLY_PREFIX}${id}`, url: null, state: { postly_post_id: id, postly_channel: target.channelId } };
    },
  };
}

/** One delivery, as far as the activity endpoint describes it (its items are loosely typed). */
export interface Delivery {
  readonly postId: string;
  readonly state: "published" | "failed" | "pending";
  readonly url: string | null;
  readonly reason: string | null;
}

const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

function firstUrl(items: readonly Record<string, unknown>[]): string | null {
  for (const d of items) {
    const u = str(d["url"]) ?? str(d["post_url"]) ?? str(d["permalink"]) ?? str(d["published_url"]) ?? str(d["link"]);
    if (u && /^https?:\/\//.test(u)) return u;
  }
  return null;
}

function firstReason(items: readonly Record<string, unknown>[]): string | null {
  for (const d of items) {
    const r = str(d["error"]) ?? str(d["message"]) ?? str(d["reason"]) ?? str((d["error"] as Record<string, unknown> | undefined)?.["message"]);
    if (r) return r;
  }
  return null;
}

/** Read Postly's activity for a window and say, per post, what became of it. */
export async function postlyDeliveries(http: Http, apiKey: string, from: Date, until: Date): Promise<Delivery[]> {
  const out: Delivery[] = [];
  for (let skip = 0; skip < 1000; skip += 100) {
    const q = new URLSearchParams({ activity_from: from.toISOString(), activity_until: until.toISOString(), limit: "100", skip: String(skip) });
    const res = await http.get<{ data?: { posts?: Record<string, unknown>[]; total_count?: number } }>(`${POSTLY_API}/posts/activity?${q.toString()}`, headers(apiKey));
    const posts = res.data?.posts ?? [];
    for (const p of posts) {
      const postId = str(p["post_id"]);
      if (!postId) continue;
      const published = (p["published_deliveries"] as Record<string, unknown>[] | undefined) ?? [];
      const failed = (p["failed_deliveries"] as Record<string, unknown>[] | undefined) ?? [];
      const state = p["failed"] === true || (failed.length > 0 && published.length === 0) ? "failed" : p["published"] === true || published.length > 0 ? "published" : "pending";
      out.push({ postId, state, url: firstUrl(published), reason: state === "failed" ? (firstReason(failed) ?? str(p["effective_status"]) ?? "Postly reports the delivery failed") : null });
    }
    if (posts.length < 100) break;
  }
  return out;
}
