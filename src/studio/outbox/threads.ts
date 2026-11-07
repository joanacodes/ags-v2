/**
 * Threads, through its own API (graph.threads.net): text with one topic tag, a picture or a video from
 * a signed URL, carousels from item containers; replies pulled per post and sent on the owner's tap.
 */
import type { PostRow, ReplyRow } from "../store/rows";
import type { NewReply } from "../store/store";
import { PlatformError, sleep } from "./http";
import { mediaOf, type ClientDeps, type Numbers, type PlatformClient, type PublishInput, type Published, type Token } from "./types";

const BASE = "https://graph.threads.net/v1.0";
const q = (params: Record<string, string | number | boolean | undefined>) =>
  Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== "")
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join("&");

/**
 * A Threads token lasts 60 days and has no refresh token: it renews itself while still valid and at
 * least a day old. Renewed on use when under ten days remain, and daily by the maintenance run.
 */
export async function refreshThreadsToken(deps: ClientDeps, now = new Date()): Promise<Token> {
  const t = deps.token;
  const left = t.expires_at ? Date.parse(t.expires_at) - now.getTime() : Infinity;
  if (left > 10 * 86400_000 || left <= 0) return t;
  const res = await deps.http.get<{ access_token: string; expires_in: number }>(`https://graph.threads.net/refresh_access_token?${q({ grant_type: "th_refresh_token", access_token: t.access_token })}`);
  const next: Token = { ...t, access_token: res.access_token, expires_at: new Date(now.getTime() + res.expires_in * 1000).toISOString() };
  await deps.saveToken(next);
  return next;
}

export function threadsClient(deps: ClientDeps): PlatformClient {
  const user = () => deps.token.account["user_id"] ?? "me";
  let current: Token = deps.token;
  let renewed: Promise<void> | null = null;
  const keepAlive = () =>
    (renewed ??= refreshThreadsToken(deps)
      .then((t) => {
        current = t;
      })
      .catch(() => undefined));
  const token = () => current.access_token;

  async function create(params: Record<string, string | boolean | undefined>): Promise<string> {
    const res = await deps.http.write<{ id: string }>("POST", `${BASE}/${user()}/threads?${q({ ...params, access_token: token() })}`, { summary: params });
    return res.id;
  }

  async function ready(id: string): Promise<void> {
    const until = Date.now() + 5 * 60_000;
    for (;;) {
      const res = await deps.http.get<{ status?: string; error_message?: string }>(`${BASE}/${id}?${q({ fields: "status,error_message", access_token: token() })}`);
      if (!res.status || res.status === "FINISHED" || res.status === "PUBLISHED") return;
      if (res.status === "ERROR" || res.status === "EXPIRED") throw new PlatformError(`Threads couldn't process the file: ${res.error_message ?? res.status}`, 422, JSON.stringify(res));
      if (Date.now() > until) throw new PlatformError("Threads took too long to process the file", 504, "");
      await sleep(4000);
    }
  }

  async function publishContainer(id: string): Promise<Published> {
    await ready(id);
    const res = await deps.http.write<{ id: string }>("POST", `${BASE}/${user()}/threads_publish?${q({ creation_id: id, access_token: token() })}`, { summary: { creation_id: id } });
    const link = await deps.http.get<{ permalink?: string }>(`${BASE}/${res.id}?${q({ fields: "permalink", access_token: token() })}`).catch(() => ({ permalink: undefined }));
    return { id: res.id, url: link.permalink ?? null, state: { creation_id: id } };
  }

  return {
    platform: "threads",
    async publish(input: PublishInput): Promise<Published> {
      await keepAlive();
      const { post, media } = input;
      const text = post.caption ?? "";
      const topic = post.tags[0]?.replace(/^#/, "");
      if (post.format === "carousel") {
        const images = mediaOf(media, "image").slice(0, 20);
        if (images.length < 2) throw new Error("a carousel needs at least two rendered slides");
        const children: string[] = [];
        for (const img of images) children.push(await create({ media_type: "IMAGE", image_url: await input.signedUrl(img.path), is_carousel_item: true }));
        for (const child of children) await ready(child);
        return publishContainer(await create({ media_type: "CAROUSEL", children: children.join(","), text, topic_tag: topic }));
      }
      if (post.format === "video") {
        const video = mediaOf(media, "video")[0];
        if (!video) throw new Error("no rendered video");
        return publishContainer(await create({ media_type: "VIDEO", video_url: await input.signedUrl(video.path), text, topic_tag: topic }));
      }
      const img = mediaOf(media, "image")[0];
      if (img) return publishContainer(await create({ media_type: "IMAGE", image_url: await input.signedUrl(img.path), text, topic_tag: topic }));
      return publishContainer(await create({ media_type: "TEXT", text, topic_tag: topic }));
    },

    async numbers(post: PostRow): Promise<Numbers | null> {
      if (!post.platform_post_id) return null;
      await keepAlive();
      const res = await deps.http.get<{ data?: { name: string; values?: { value: number }[]; total_value?: { value: number } }[] }>(
        `${BASE}/${post.platform_post_id}/insights?${q({ metric: "views,likes,replies,reposts,quotes,shares", access_token: token() })}`,
      );
      const get = (name: string) => {
        const m = res.data?.find((d) => d.name === name);
        return m?.total_value?.value ?? m?.values?.[0]?.value ?? null;
      };
      const reposts = (get("reposts") ?? 0) + (get("quotes") ?? 0) + (get("shares") ?? 0);
      return { views: get("views"), likes: get("likes"), comments: get("replies"), shares: reposts, saves: null, link_taps: null };
    },

    async comments(since: Date, pieces: ReadonlyMap<string, string>): Promise<NewReply[]> {
      await keepAlive();
      const out: NewReply[] = [];
      for (const [platformId, pieceId] of pieces) {
        const list = await deps.http
          .get<{ data?: { id: string; text?: string; username?: string; timestamp?: string }[] }>(`${BASE}/${platformId}/replies?${q({ fields: "id,text,username,timestamp", access_token: token() })}`)
          .catch(() => ({ data: [] }));
        for (const r of list.data ?? []) {
          if (!r.text || !r.timestamp || new Date(r.timestamp) <= since) continue;
          if (r.username && r.username === deps.token.account["username"]) continue;
          out.push({ platform: "threads", thread_ref: r.id, parent_ref: platformId, post_id: pieceId, author_handle: r.username ?? null, author_ref: r.username ?? null, their_text: r.text, received_at: r.timestamp });
        }
      }
      return out;
    },

    async reply(reply: ReplyRow, text: string): Promise<{ ref: string }> {
      await keepAlive();
      const id = await create({ media_type: "TEXT", text, reply_to_id: reply.thread_ref });
      const done = await publishContainer(id);
      return { ref: done.id };
    },
  };
}
