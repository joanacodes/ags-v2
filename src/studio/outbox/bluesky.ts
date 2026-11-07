/**
 * Bluesky, through the AT Protocol with an app password (Settings → App passwords on bsky.app): one
 * session per run, a post with its language, links and hashtags as facets (byte offsets, which is what
 * the protocol counts), the still picture as an image embed; likes, reposts and replies back; replies
 * and mentions from the notifications.
 */
import type { PostRow, ReplyRow } from "../store/rows";
import type { NewReply } from "../store/store";
import { mediaOf, type ClientDeps, type Numbers, type PlatformClient, type PublishInput, type Published } from "./types";

interface Session {
  readonly accessJwt: string;
  readonly did: string;
  readonly handle: string;
}

interface Facet {
  readonly index: { byteStart: number; byteEnd: number };
  readonly features: readonly ({ $type: "app.bsky.richtext.facet#link"; uri: string } | { $type: "app.bsky.richtext.facet#tag"; tag: string })[];
}

const encoder = new TextEncoder();
const bytesBefore = (text: string, index: number) => encoder.encode(text.slice(0, index)).length;

/** Links and hashtags as facets; without them Bluesky shows a link as plain, unclickable text. */
export function facetsOf(text: string): Facet[] {
  const facets: Facet[] = [];
  for (const m of text.matchAll(/https?:\/\/[^\s<>"]+/g)) {
    const uri = m[0].replace(/[.,;:!?)\]]+$/, "");
    const start = m.index ?? 0;
    facets.push({ index: { byteStart: bytesBefore(text, start), byteEnd: bytesBefore(text, start + uri.length) }, features: [{ $type: "app.bsky.richtext.facet#link", uri }] });
  }
  for (const m of text.matchAll(/(^|\s)#([\p{L}\p{N}_]{1,64})/gu)) {
    const start = (m.index ?? 0) + (m[1]?.length ?? 0);
    const tag = m[2] ?? "";
    facets.push({ index: { byteStart: bytesBefore(text, start), byteEnd: bytesBefore(text, start + tag.length + 1) }, features: [{ $type: "app.bsky.richtext.facet#tag", tag }] });
  }
  return facets.sort((a, b) => a.index.byteStart - b.index.byteStart);
}

const rkeyOf = (uri: string) => uri.split("/").pop() ?? "";

export function blueskyClient(deps: ClientDeps): PlatformClient {
  const service = () => (deps.token.account["service"] || "https://bsky.social").replace(/\/$/, "");
  let session: Session | null = null;

  async function signIn(): Promise<Session> {
    if (session) return session;
    // The app password is the stored secret; a session lasts a couple of hours, longer than any run.
    session = await deps.http.signIn<Session>(`${service()}/xrpc/com.atproto.server.createSession`, {
      json: { identifier: deps.token.account["handle"] ?? "", password: deps.token.access_token },
    });
    return session;
  }
  const auth = async () => ({ Authorization: `Bearer ${(await signIn()).accessJwt}` });

  async function createPost(record: Record<string, unknown>): Promise<{ uri: string; cid: string }> {
    const s = await signIn();
    return deps.http.write<{ uri: string; cid: string }>("POST", `${service()}/xrpc/com.atproto.repo.createRecord`, {
      headers: await auth(),
      json: { repo: s.did, collection: "app.bsky.feed.post", record: { $type: "app.bsky.feed.post", createdAt: new Date().toISOString(), ...record } },
    });
  }

  return {
    platform: "bluesky",
    async publish(input: PublishInput): Promise<Published> {
      const { post, card, media } = input;
      const text = post.caption ?? "";
      const record: Record<string, unknown> = { text, langs: [post.language], facets: facetsOf(text) };
      const img = mediaOf(media, "image")[0];
      if (img) {
        const bytes = await input.download(img.path);
        const blob = await deps.http.write<{ blob: unknown }>("POST", `${service()}/xrpc/com.atproto.repo.uploadBlob`, {
          headers: { ...(await auth()), "content-type": "image/jpeg" },
          body: bytes,
          summary: { picture: img.path, bytes: bytes.byteLength },
        });
        record["embed"] = {
          $type: "app.bsky.embed.images",
          images: [{ alt: (post.title ?? card.hook).slice(0, 1000), image: blob.blob, aspectRatio: { width: img.width ?? 1080, height: img.height ?? 1080 } }],
        };
      }
      const res = await createPost(record);
      const s = await signIn();
      return { id: res.uri, url: `https://bsky.app/profile/${s.handle}/post/${rkeyOf(res.uri)}`, state: { cid: res.cid } };
    },

    async numbers(post: PostRow): Promise<Numbers | null> {
      if (!post.platform_post_id) return null;
      const res = await deps.http.get<{ posts?: { likeCount?: number; repostCount?: number; replyCount?: number; quoteCount?: number }[] }>(
        `${service()}/xrpc/app.bsky.feed.getPosts?uris=${encodeURIComponent(post.platform_post_id)}`,
        await auth(),
      );
      const p = res.posts?.[0];
      if (!p) return null;
      return { views: null, likes: p.likeCount ?? null, comments: p.replyCount ?? null, shares: (p.repostCount ?? 0) + (p.quoteCount ?? 0), saves: null, link_taps: null };
    },

    async comments(since: Date, pieces: ReadonlyMap<string, string>): Promise<NewReply[]> {
      const s = await signIn();
      const res = await deps.http.get<{
        notifications?: { uri: string; reason: string; author?: { did?: string; handle?: string }; record?: { text?: string; createdAt?: string; reply?: { root?: { uri?: string }; parent?: { uri?: string } } }; indexedAt?: string }[];
      }>(`${service()}/xrpc/app.bsky.notification.listNotifications?limit=100`, await auth());
      const out: NewReply[] = [];
      for (const n of res.notifications ?? []) {
        if (n.reason !== "reply" && n.reason !== "mention" && n.reason !== "quote") continue;
        const at = n.record?.createdAt ?? n.indexedAt;
        if (!at || new Date(at) <= since || !n.record?.text) continue;
        if (n.author?.did === s.did) continue;
        const root = n.record.reply?.root?.uri ?? null;
        out.push({
          platform: "bluesky",
          thread_ref: n.uri,
          parent_ref: n.record.reply?.parent?.uri ?? null,
          post_id: root ? (pieces.get(root) ?? null) : null,
          author_handle: n.author?.handle ?? null,
          author_ref: n.author?.did ?? null,
          their_text: n.record.text,
          received_at: at,
        });
      }
      return out;
    },

    async reply(reply: ReplyRow, text: string): Promise<{ ref: string }> {
      // A reply names its parent and the thread's root, each by address and content hash.
      const res = await deps.http.get<{ posts?: { uri: string; cid: string; record?: { reply?: { root?: { uri: string; cid: string } } } }[] }>(
        `${service()}/xrpc/app.bsky.feed.getPosts?uris=${encodeURIComponent(reply.thread_ref)}`,
        await auth(),
      );
      const parent = res.posts?.[0];
      if (!parent) throw new Error("the comment is gone from Bluesky");
      const root = parent.record?.reply?.root ?? { uri: parent.uri, cid: parent.cid };
      const done = await createPost({ text, facets: facetsOf(text), reply: { root, parent: { uri: parent.uri, cid: parent.cid } } });
      return { ref: done.uri };
    },
  };
}
