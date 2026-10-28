/**
 * X, through API v2 with OAuth 2.0 (PKCE, offline access): a post with its still picture, the reply on
 * the owner's tap; public metrics; mentions since the last pull. X's API is paid by use: the platform is
 * off in Settings until the owner has a plan, and the metrics worker skips it when reads are refused.
 */
import type { PostRow, ReplyRow } from "../store/rows";
import type { NewReply } from "../store/store";
import { mediaOf, type ClientDeps, type Numbers, type PlatformClient, type PublishInput, type Published, type Token } from "./types";

const API = "https://api.x.com/2";

async function accessToken(deps: ClientDeps): Promise<string> {
  const t = deps.token;
  const fresh = t.expires_at && Date.parse(t.expires_at) > Date.now() + 120_000;
  if (fresh || !t.refresh_token) return t.access_token;
  const id = process.env.X_CLIENT_ID ?? "";
  const secret = process.env.X_CLIENT_SECRET ?? "";
  const data = await deps.http
    .signIn<{ access_token: string; refresh_token?: string; expires_in: number; scope?: string }>(`${API}/oauth2/token`, {
      headers: secret ? { Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}` } : {},
      form: { grant_type: "refresh_token", refresh_token: t.refresh_token, client_id: id },
    })
    .catch((e: unknown) => {
      throw new Error(`X refused to refresh its token: reconnect X in Settings (${e instanceof Error ? e.message : String(e)})`);
    });
  // X's refresh tokens work once: the new one must be saved before anything else can fail.
  const next: Token = { ...t, access_token: data.access_token, refresh_token: data.refresh_token ?? t.refresh_token, expires_at: new Date(Date.now() + data.expires_in * 1000).toISOString() };
  await deps.saveToken(next);
  return next.access_token;
}

export function xClient(deps: ClientDeps): PlatformClient {
  const auth = async () => ({ Authorization: `Bearer ${await accessToken(deps)}` });
  const me = () => deps.token.account["user_id"] ?? "";
  return {
    platform: "x",
    async publish(input: PublishInput): Promise<Published> {
      const { post, media } = input;
      const img = mediaOf(media, "image")[0];
      const body: Record<string, unknown> = { text: post.caption ?? "" };
      if (img) {
        const bytes = await input.download(img.path);
        const form = new FormData();
        form.append("media", new Blob([bytes as Uint8Array<ArrayBuffer>], { type: "image/jpeg" }), "picture.jpg");
        form.append("media_category", "tweet_image");
        form.append("media_type", "image/jpeg");
        const up = await deps.http.write<{ data?: { id?: string }; media_id_string?: string }>("POST", `${API}/media/upload`, { headers: await auth(), body: form, summary: { picture: img.path, bytes: bytes.byteLength } });
        const mediaId = up.data?.id ?? up.media_id_string;
        if (!mediaId) throw new Error("X gave no media id for the picture");
        body["media"] = { media_ids: [mediaId] };
      }
      const res = await deps.http.write<{ data: { id: string } }>("POST", `${API}/tweets`, { headers: await auth(), json: body });
      const user = deps.token.account["username"];
      return { id: res.data.id, url: user ? `https://x.com/${user}/status/${res.data.id}` : `https://x.com/i/web/status/${res.data.id}` };
    },

    async numbers(post: PostRow): Promise<Numbers | null> {
      if (!post.platform_post_id) return null;
      const res = await deps.http.get<{ data?: { public_metrics?: { like_count?: number; reply_count?: number; retweet_count?: number; quote_count?: number; bookmark_count?: number; impression_count?: number } } }>(
        `${API}/tweets/${post.platform_post_id}?tweet.fields=public_metrics`,
        await auth(),
      );
      const m = res.data?.public_metrics;
      if (!m) return null;
      return { views: m.impression_count ?? null, likes: m.like_count ?? null, comments: m.reply_count ?? null, shares: (m.retweet_count ?? 0) + (m.quote_count ?? 0), saves: m.bookmark_count ?? null, link_taps: null };
    },

    async comments(since: Date, pieces: ReadonlyMap<string, string>): Promise<NewReply[]> {
      if (!me()) return [];
      const res = await deps.http.get<{ data?: { id: string; text: string; author_id?: string; conversation_id?: string; created_at?: string; lang?: string }[]; includes?: { users?: { id: string; username: string }[] } }>(
        `${API}/users/${me()}/mentions?max_results=100&start_time=${encodeURIComponent(since.toISOString())}&tweet.fields=created_at,conversation_id,author_id,lang&expansions=author_id&user.fields=username`,
        await auth(),
      );
      const names = new Map((res.includes?.users ?? []).map((u) => [u.id, u.username]));
      const out: NewReply[] = [];
      for (const t of res.data ?? []) {
        if (t.author_id === me() || !t.created_at) continue;
        out.push({
          platform: "x",
          thread_ref: t.id,
          parent_ref: t.conversation_id ?? null,
          post_id: t.conversation_id ? (pieces.get(t.conversation_id) ?? null) : null,
          author_handle: t.author_id ? (names.get(t.author_id) ?? null) : null,
          author_ref: t.author_id ?? null,
          their_text: t.text,
          their_lang: t.lang ?? null,
          received_at: t.created_at,
        });
      }
      return out;
    },

    async reply(reply: ReplyRow, text: string): Promise<{ ref: string }> {
      const res = await deps.http.write<{ data: { id: string } }>("POST", `${API}/tweets`, { headers: await auth(), json: { text, reply: { in_reply_to_tweet_id: reply.thread_ref } } });
      return { ref: res.data.id };
    },
  };
}
