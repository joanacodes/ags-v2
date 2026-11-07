/**
 * TikTok, through the Content Posting API, behind its flag (Settings → TikTok → API). Until TikTok's
 * audit, an app can only post privately, so the default mode sends the video to the owner's TikTok
 * inbox ("inbox"): they open TikTok, add the sound if they want, switch on the AI-generated label and
 * post. After the audit, "direct" posts it with the label set. With the flag off, TikTok is by hand.
 */
import type { PostRow } from "../store/rows";
import { PlatformError, sleep } from "./http";
import { mediaOf, type ClientDeps, type Numbers, type PlatformClient, type PublishInput, type Published, type Token } from "./types";

const API = "https://open.tiktokapis.com/v2";

interface TikTokAnswer<T> {
  readonly data?: T;
  readonly error?: { code?: string; message?: string };
}

function unwrap<T>(res: TikTokAnswer<T>, what: string): T {
  if (res.error?.code && res.error.code !== "ok") throw new PlatformError(`TikTok refused ${what}: ${res.error.message ?? res.error.code}`, 400, JSON.stringify(res.error));
  if (!res.data) throw new PlatformError(`TikTok sent nothing back for ${what}`, 502, "");
  return res.data;
}

async function accessToken(deps: ClientDeps): Promise<string> {
  const t = deps.token;
  const fresh = t.expires_at && Date.parse(t.expires_at) > Date.now() + 300_000;
  if (fresh || !t.refresh_token) return t.access_token;
  const data = await deps.http
    .signIn<{ access_token: string; refresh_token?: string; expires_in: number }>(`${API}/oauth/token/`, {
      form: { client_key: process.env.TIKTOK_CLIENT_KEY ?? "", client_secret: process.env.TIKTOK_CLIENT_SECRET ?? "", grant_type: "refresh_token", refresh_token: t.refresh_token },
    })
    .catch((e: unknown) => {
      throw new Error(`TikTok refused to refresh its token: reconnect TikTok in Settings (${e instanceof Error ? e.message : String(e)})`);
    });
  const next: Token = { ...t, access_token: data.access_token, refresh_token: data.refresh_token ?? t.refresh_token, expires_at: new Date(Date.now() + data.expires_in * 1000).toISOString() };
  await deps.saveToken(next);
  return next.access_token;
}

/** A TikTok video's id from the address the owner pastes after posting by hand. */
export function tiktokIdFromUrl(url: string): string | null {
  return /\/video\/(\d{8,})/.exec(url)?.[1] ?? null;
}

export function tiktokClient(deps: ClientDeps, mode: "inbox" | "direct"): PlatformClient {
  const auth = async () => ({ Authorization: `Bearer ${await accessToken(deps)}` });
  return {
    platform: "tiktok",
    async publish(input: PublishInput): Promise<Published> {
      const { post, media } = input;
      const video = mediaOf(media, "video")[0];
      if (!video) throw new Error("no rendered video");
      const bytes = await input.download(video.path);
      // Under 64 MB a video goes up in one piece, which is every Studio video.
      const source_info = { source: "FILE_UPLOAD", video_size: bytes.byteLength, chunk_size: bytes.byteLength, total_chunk_count: 1 };
      let init: { publish_id: string; upload_url: string };
      if (mode === "direct") {
        const creator = unwrap(await deps.http.query<TikTokAnswer<{ privacy_level_options?: string[] }>>(`${API}/post/publish/creator_info/query/`, { headers: await auth() }), "the account's settings");
        const privacy = creator.privacy_level_options?.includes("PUBLIC_TO_EVERYONE") ? "PUBLIC_TO_EVERYONE" : (creator.privacy_level_options?.[0] ?? "SELF_ONLY");
        init = unwrap(
          await deps.http.write<TikTokAnswer<{ publish_id: string; upload_url: string }>>("POST", `${API}/post/publish/video/init/`, {
            headers: await auth(),
            json: { post_info: { title: (post.caption ?? "").slice(0, 2200), privacy_level: privacy, disable_comment: false, disable_duet: false, disable_stitch: false, video_cover_timestamp_ms: 1000, is_aigc: post.disclosure }, source_info },
          }),
          "the post",
        );
      } else {
        init = unwrap(await deps.http.write<TikTokAnswer<{ publish_id: string; upload_url: string }>>("POST", `${API}/post/publish/inbox/video/init/`, { headers: await auth(), json: { source_info } }), "the upload");
      }
      await deps.http.write("PUT", init.upload_url, {
        headers: { "Content-Type": "video/mp4", "Content-Range": `bytes 0-${bytes.byteLength - 1}/${bytes.byteLength}` },
        body: bytes,
        summary: { video: video.path, bytes: bytes.byteLength },
      });
      const until = Date.now() + 5 * 60_000;
      for (;;) {
        const status = unwrap(await deps.http.query<TikTokAnswer<{ status?: string; fail_reason?: string; publicaly_available_post_id?: (string | number)[] }>>(`${API}/post/publish/status/fetch/`, { headers: await auth(), json: { publish_id: init.publish_id } }), "the status");
        if (status.status === "FAILED") throw new PlatformError(`TikTok couldn't take the video: ${status.fail_reason ?? "no reason given"}`, 422, JSON.stringify(status));
        if (status.status === "SEND_TO_USER_INBOX") return { id: init.publish_id, url: null, state: { inbox: true } };
        if (status.status === "PUBLISH_COMPLETE") {
          const id = status.publicaly_available_post_id?.[0];
          const user = deps.token.account["username"];
          return { id: id ? String(id) : init.publish_id, url: id && user ? `https://www.tiktok.com/@${user}/video/${id}` : null, state: { publish_id: init.publish_id } };
        }
        if (Date.now() > until) return { id: init.publish_id, url: null, state: { processing: true } };
        await sleep(5000);
      }
    },

    async numbers(post: PostRow): Promise<Numbers | null> {
      const id = post.platform_post_id && /^\d+$/.test(post.platform_post_id) ? post.platform_post_id : post.platform_url ? tiktokIdFromUrl(post.platform_url) : null;
      if (!id) return null;
      const res = await deps.http.query<TikTokAnswer<{ videos?: { view_count?: number; like_count?: number; comment_count?: number; share_count?: number }[] }>>(
        `${API}/video/query/?fields=id,view_count,like_count,comment_count,share_count`,
        { headers: await auth(), json: { filters: { video_ids: [id] } } },
      );
      const v = res.data?.videos?.[0];
      if (!v) return null;
      return { views: v.view_count ?? null, likes: v.like_count ?? null, comments: v.comment_count ?? null, shares: v.share_count ?? null, saves: null, link_taps: null };
    },
  };
}
