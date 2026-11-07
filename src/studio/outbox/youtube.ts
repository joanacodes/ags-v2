/**
 * YouTube, through the Data API v3 with an OAuth refresh token: a resumable upload of the file from
 * Storage, the title written for search, the description with the ?src=yt link, the AI-voice flag
 * (containsSyntheticMedia) on every voiced video; statistics and comment threads back.
 * Quota: 10,000 units a day, an upload is 1,600 (six a day at most).
 */
import type { PostRow, ReplyRow } from "../store/rows";
import type { NewReply } from "../store/store";
import { mediaOf, type ClientDeps, type Numbers, type PlatformClient, type PublishInput, type Published, type Token } from "./types";

const API = "https://www.googleapis.com/youtube/v3";
const UPLOAD = "https://www.googleapis.com/upload/youtube/v3/videos";

export async function googleAccessToken(deps: ClientDeps): Promise<string> {
  const t = deps.token;
  const fresh = t.expires_at && Date.parse(t.expires_at) > Date.now() + 120_000;
  if (fresh || !t.refresh_token) return t.access_token;
  const clientId = process.env.GOOGLE_CLIENT_ID ?? "";
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET ?? "";
  const data = await deps.http
    .signIn<{ access_token: string; expires_in: number }>("https://oauth2.googleapis.com/token", {
      form: { client_id: clientId, client_secret: clientSecret, refresh_token: t.refresh_token, grant_type: "refresh_token" },
    })
    .catch((e: unknown) => {
      throw new Error(`Google refused to refresh the YouTube token: reconnect YouTube in Settings (${e instanceof Error ? e.message : String(e)})`);
    });
  const next: Token = { ...t, access_token: data.access_token, expires_at: new Date(Date.now() + data.expires_in * 1000).toISOString() };
  await deps.saveToken(next);
  return next.access_token;
}

export function youtubeClient(deps: ClientDeps): PlatformClient {
  const auth = async () => ({ Authorization: `Bearer ${await googleAccessToken(deps)}` });
  return {
    platform: "youtube",
    async publish(input: PublishInput): Promise<Published> {
      const { post, media } = input;
      const video = mediaOf(media, "video")[0];
      if (!video) throw new Error("no rendered video");
      const bytes = await input.download(video.path);
      const snippet = {
        title: (post.title ?? "").slice(0, 100),
        description: (post.description ?? post.caption ?? "").slice(0, 4900),
        tags: post.tags.map((t) => t.replace(/^#/, "")).slice(0, 15),
        categoryId: "22",
        defaultLanguage: post.language,
        defaultAudioLanguage: post.language,
      };
      const status = { privacyStatus: "public", selfDeclaredMadeForKids: false, containsSyntheticMedia: post.disclosure };
      const session = await deps.http.writeRaw("POST", `${UPLOAD}?uploadType=resumable&part=snippet,status`, {
        headers: { ...(await auth()), "content-type": "application/json; charset=UTF-8", "X-Upload-Content-Type": "video/mp4", "X-Upload-Content-Length": String(bytes.byteLength) },
        json: { snippet, status },
      });
      const location = session.headers.get("location");
      if (!location) throw new Error("YouTube gave no upload address");
      const done = await deps.http.write<{ id: string }>("PUT", location, { headers: { ...(await auth()), "content-type": "video/mp4" }, body: bytes, summary: { bytes: bytes.byteLength } });
      return { id: done.id, url: `https://www.youtube.com/shorts/${done.id}` };
    },

    async numbers(post: PostRow): Promise<Numbers | null> {
      if (!post.platform_post_id) return null;
      const res = await deps.http.get<{ items?: { statistics?: { viewCount?: string; likeCount?: string; commentCount?: string } }[] }>(`${API}/videos?part=statistics&id=${encodeURIComponent(post.platform_post_id)}`, await auth());
      const s = res.items?.[0]?.statistics;
      if (!s) return null;
      const n = (v?: string) => (v === undefined ? null : Number(v));
      return { views: n(s.viewCount), likes: n(s.likeCount), comments: n(s.commentCount), shares: null, saves: null, link_taps: null };
    },

    async comments(since: Date, pieces: ReadonlyMap<string, string>): Promise<NewReply[]> {
      const out: NewReply[] = [];
      for (const [videoId, pieceId] of pieces) {
        const res = await deps.http
          .get<{ items?: { id: string; snippet?: { topLevelComment?: { id: string; snippet?: { textOriginal?: string; authorDisplayName?: string; authorChannelId?: { value?: string }; publishedAt?: string } } } }[] }>(
            `${API}/commentThreads?part=snippet&maxResults=50&order=time&videoId=${encodeURIComponent(videoId)}`,
            await auth(),
          )
          .catch(() => ({ items: [] }));
        for (const item of res.items ?? []) {
          const c = item.snippet?.topLevelComment;
          const s = c?.snippet;
          if (!c || !s?.textOriginal || !s.publishedAt || new Date(s.publishedAt) <= since) continue;
          if (s.authorChannelId?.value && s.authorChannelId.value === deps.token.account["channel_id"]) continue;
          out.push({ platform: "youtube", thread_ref: c.id, parent_ref: videoId, post_id: pieceId, author_handle: s.authorDisplayName ?? null, author_ref: s.authorChannelId?.value ?? null, their_text: s.textOriginal, received_at: s.publishedAt });
        }
      }
      return out;
    },

    async reply(reply: ReplyRow, text: string): Promise<{ ref: string }> {
      const res = await deps.http.write<{ id: string }>("POST", `${API}/comments?part=snippet`, { headers: await auth(), json: { snippet: { parentId: reply.thread_ref, textOriginal: text } } });
      return { ref: res.id };
    },
  };
}
