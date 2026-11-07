/**
 * Instagram and Facebook, through Meta's Graph API with the Page's token (one Facebook Login gives
 * both). Instagram posts are containers: created from a signed URL, polled until Meta has fetched and
 * processed the file, then published. Facebook Reels are uploaded from the same signed URL; photos and
 * text go to the Page's feed.
 */
import type { PostRow, ReplyRow } from "../store/rows";
import type { NewReply } from "../store/store";
import { PlatformError, sleep } from "./http";
import { mediaOf, type ClientDeps, type Numbers, type PlatformClient, type PublishInput, type Published } from "./types";

export function graphVersion(): string {
  return (process.env.META_GRAPH_VERSION ?? "v24.0").trim();
}

const base = () => `https://graph.facebook.com/${graphVersion()}`;
const q = (params: Record<string, string | number | boolean | undefined>) =>
  Object.entries(params)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join("&");

function pageToken(deps: ClientDeps): string {
  return deps.token.account["page_token"] ?? deps.token.access_token;
}

/** Poll a container until Meta says it is ready (FINISHED), or stop with its error. */
async function waitForContainer(deps: ClientDeps, id: string, token: string, minutes = 6): Promise<void> {
  const until = Date.now() + minutes * 60_000;
  for (;;) {
    const res = await deps.http.get<{ status_code?: string; status?: string }>(`${base()}/${id}?${q({ fields: "status_code,status", access_token: token })}`);
    if (res.status_code === "FINISHED" || res.status_code === "PUBLISHED") return;
    if (res.status_code === "ERROR" || res.status_code === "EXPIRED") throw new PlatformError(`Instagram couldn't process the file: ${res.status ?? res.status_code}`, 422, JSON.stringify(res));
    if (Date.now() > until) throw new PlatformError("Instagram took too long to process the file", 504, JSON.stringify(res));
    await sleep(5000);
  }
}

export function instagramClient(deps: ClientDeps): PlatformClient {
  const ig = () => {
    const id = deps.token.account["ig_user_id"];
    if (!id) throw new Error("the Meta connection has no Instagram account: reconnect and pick the Page linked to Instagram");
    return id;
  };
  const token = () => pageToken(deps);

  async function container(params: Record<string, string | boolean | undefined>): Promise<string> {
    const res = await deps.http.write<{ id: string }>("POST", `${base()}/${ig()}/media?${q({ ...params, access_token: token() })}`, { summary: params });
    return res.id;
  }

  async function publishContainer(creationId: string): Promise<Published> {
    await waitForContainer(deps, creationId, token());
    const res = await deps.http.write<{ id: string }>("POST", `${base()}/${ig()}/media_publish?${q({ creation_id: creationId, access_token: token() })}`, { summary: { creation_id: creationId } });
    const link = await deps.http.get<{ permalink?: string }>(`${base()}/${res.id}?${q({ fields: "permalink", access_token: token() })}`).catch(() => ({ permalink: undefined }));
    return { id: res.id, url: link.permalink ?? null, state: { creation_id: creationId } };
  }

  return {
    platform: "instagram",
    async publish(input: PublishInput): Promise<Published> {
      const { post, media } = input;
      const caption = post.caption ?? "";
      if (post.format === "video") {
        const video = mediaOf(media, "video")[0];
        if (!video) throw new Error("no rendered video");
        const id = await container({ media_type: "REELS", video_url: await input.signedUrl(video.path), caption, share_to_feed: true });
        return publishContainer(id);
      }
      if (post.format === "carousel") {
        const images = mediaOf(media, "image").slice(0, 10);
        if (images.length < 2) throw new Error("a carousel needs at least two rendered slides");
        const children: string[] = [];
        for (const img of images) children.push(await container({ image_url: await input.signedUrl(img.path), is_carousel_item: true }));
        for (const child of children) await waitForContainer(deps, child, token(), 3);
        const id = await container({ media_type: "CAROUSEL", children: children.join(","), caption });
        return publishContainer(id);
      }
      if (post.format === "story") {
        const img = mediaOf(media, "image")[0];
        const video = mediaOf(media, "video")[0];
        if (!img && !video) throw new Error("no rendered story");
        const id = await container(video ? { media_type: "STORIES", video_url: await input.signedUrl(video.path) } : { media_type: "STORIES", image_url: await input.signedUrl(img!.path) });
        return publishContainer(id);
      }
      const img = mediaOf(media, "image")[0];
      if (!img) throw new Error(`Instagram can't post a ${post.format} without a picture`);
      const id = await container({ image_url: await input.signedUrl(img.path), caption });
      return publishContainer(id);
    },

    async numbers(post: PostRow): Promise<Numbers | null> {
      if (!post.platform_post_id) return null;
      const res = await deps.http.get<{ data?: { name: string; values?: { value: number }[]; total_value?: { value: number } }[] }>(
        `${base()}/${post.platform_post_id}/insights?${q({ metric: "views,reach,likes,comments,shares,saved", access_token: token() })}`,
      );
      const get = (name: string) => {
        const m = res.data?.find((d) => d.name === name);
        return m?.total_value?.value ?? m?.values?.[0]?.value ?? null;
      };
      return { views: get("views") ?? get("reach"), likes: get("likes"), comments: get("comments"), shares: get("shares"), saves: get("saved"), link_taps: null };
    },

    async comments(since: Date, pieces: ReadonlyMap<string, string>): Promise<NewReply[]> {
      const out: NewReply[] = [];
      const recent = await deps.http.get<{ data?: { id: string; timestamp?: string; comments_count?: number }[] }>(`${base()}/${ig()}/media?${q({ fields: "id,timestamp,comments_count", limit: 30, access_token: token() })}`);
      for (const m of recent.data ?? []) {
        if (!m.comments_count) continue;
        const list = await deps.http.get<{ data?: { id: string; text?: string; username?: string; timestamp?: string; from?: { id?: string; username?: string } }[] }>(
          `${base()}/${m.id}/comments?${q({ fields: "id,text,username,timestamp,from", limit: 50, access_token: token() })}`,
        );
        for (const c of list.data ?? []) {
          if (!c.text || !c.timestamp || new Date(c.timestamp) <= since) continue;
          if (c.username && c.username === deps.token.account["ig_username"]) continue;
          out.push({ platform: "instagram", thread_ref: c.id, parent_ref: m.id, post_id: pieces.get(m.id) ?? null, author_handle: c.username ?? c.from?.username ?? null, author_ref: c.from?.id ?? c.username ?? null, their_text: c.text, received_at: c.timestamp });
        }
      }
      return out;
    },

    async reply(reply: ReplyRow, text: string): Promise<{ ref: string }> {
      const res = await deps.http.write<{ id: string }>("POST", `${base()}/${reply.thread_ref}/replies?${q({ message: text, access_token: token() })}`, { summary: { message: text } });
      return { ref: res.id };
    },
  };
}

export function facebookClient(deps: ClientDeps): PlatformClient {
  const page = () => {
    const id = deps.token.account["page_id"];
    if (!id) throw new Error("the Meta connection has no Page: reconnect and pick The Astro Study's Page");
    return id;
  };
  const token = () => pageToken(deps);
  return {
    platform: "facebook",
    async publish(input: PublishInput): Promise<Published> {
      const { post, media } = input;
      const message = post.caption ?? "";
      if (post.format === "video") {
        const video = mediaOf(media, "video")[0];
        if (!video) throw new Error("no rendered video");
        const start = await deps.http.write<{ video_id?: string; upload_url?: string }>("POST", `${base()}/${page()}/video_reels?${q({ upload_phase: "start", access_token: token() })}`, { summary: { upload_phase: "start" } });
        if (!start.video_id || !start.upload_url) throw new Error("Facebook gave no upload address for the reel");
        await deps.http.write("POST", start.upload_url, { headers: { Authorization: `OAuth ${token()}`, file_url: await input.signedUrl(video.path) }, summary: { file_url: video.path } });
        await deps.http.write("POST", `${base()}/${page()}/video_reels?${q({ upload_phase: "finish", video_id: start.video_id, video_state: "PUBLISHED", description: message, access_token: token() })}`, { summary: { upload_phase: "finish", description: message } });
        return { id: start.video_id, url: `https://www.facebook.com/reel/${start.video_id}`, state: { video_id: start.video_id } };
      }
      const img = mediaOf(media, "image")[0];
      if (img) {
        const res = await deps.http.write<{ id: string; post_id?: string }>("POST", `${base()}/${page()}/photos?${q({ url: await input.signedUrl(img.path), caption: message, access_token: token() })}`, { summary: { caption: message, image: img.path } });
        const id = res.post_id ?? res.id;
        return { id, url: `https://www.facebook.com/${id}` };
      }
      const res = await deps.http.write<{ id: string }>("POST", `${base()}/${page()}/feed?${q({ message, access_token: token() })}`, { summary: { message } });
      return { id: res.id, url: `https://www.facebook.com/${res.id}` };
    },

    async numbers(post: PostRow): Promise<Numbers | null> {
      if (!post.platform_post_id) return null;
      const res = await deps.http.get<{ reactions?: { summary?: { total_count?: number } }; comments?: { summary?: { total_count?: number } }; shares?: { count?: number } }>(
        `${base()}/${post.platform_post_id}?${q({ fields: "reactions.summary(total_count),comments.summary(total_count),shares", access_token: token() })}`,
      ).catch(() => null);
      if (!res) return null;
      return { views: null, likes: res.reactions?.summary?.total_count ?? null, comments: res.comments?.summary?.total_count ?? null, shares: res.shares?.count ?? null, saves: null, link_taps: null };
    },

    async comments(since: Date, pieces: ReadonlyMap<string, string>): Promise<NewReply[]> {
      const out: NewReply[] = [];
      for (const [platformId, pieceId] of pieces) {
        const list = await deps.http
          .get<{ data?: { id: string; message?: string; created_time?: string; from?: { id?: string; name?: string } }[] }>(`${base()}/${platformId}/comments?${q({ fields: "id,message,created_time,from", filter: "stream", limit: 50, access_token: token() })}`)
          .catch(() => ({ data: [] }));
        for (const c of list.data ?? []) {
          if (!c.message || !c.created_time || new Date(c.created_time) <= since) continue;
          if (c.from?.id === page()) continue;
          out.push({ platform: "facebook", thread_ref: c.id, parent_ref: platformId, post_id: pieceId, author_handle: c.from?.name ?? null, author_ref: c.from?.id ?? null, their_text: c.message, received_at: c.created_time });
        }
      }
      return out;
    },

    async reply(reply: ReplyRow, text: string): Promise<{ ref: string }> {
      const res = await deps.http.write<{ id: string }>("POST", `${base()}/${reply.thread_ref}/comments?${q({ message: text, access_token: token() })}`, { summary: { message: text } });
      return { ref: res.id };
    },
  };
}
