/**
 * Mastodon, through the instance's own API with a personal token (Preferences → Development → New
 * application, scopes read and write): a status with its language, the still picture with alt text,
 * an idempotency key so a retried post never doubles; favourites, boosts and replies back; mentions
 * from the notifications.
 */
import type { PostRow, ReplyRow } from "../store/rows";
import type { NewReply } from "../store/store";
import { sleep } from "./http";
import { mediaOf, type ClientDeps, type Numbers, type PlatformClient, type PublishInput, type Published } from "./types";

/** Mastodon sends statuses as HTML; the agents read plain text. */
export function plainText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>\s*<p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

export function mastodonClient(deps: ClientDeps): PlatformClient {
  const instance = () => (deps.token.account["instance"] || "https://mastodon.social").replace(/\/$/, "");
  const auth = () => ({ Authorization: `Bearer ${deps.token.access_token}` });

  async function uploadPicture(bytes: Uint8Array, alt: string): Promise<string> {
    const form = new FormData();
    form.append("file", new Blob([bytes as Uint8Array<ArrayBuffer>], { type: "image/jpeg" }), "picture.jpg");
    form.append("description", alt.slice(0, 1500));
    const res = await deps.http.write<{ id: string; url?: string | null }>("POST", `${instance()}/api/v2/media`, { headers: auth(), body: form, summary: { picture: true, bytes: bytes.byteLength, description: alt } });
    // A larger file comes back before it is processed (url null); a status can't use it until it is.
    for (let i = 0; i < 20 && !res.url; i++) {
      await sleep(2000);
      const again = await deps.http.get<{ url?: string | null }>(`${instance()}/api/v1/media/${res.id}`, auth());
      if (again.url) break;
    }
    return res.id;
  }

  return {
    platform: "mastodon",
    async publish(input: PublishInput): Promise<Published> {
      const { post, card, media } = input;
      const img = mediaOf(media, "image")[0];
      const mediaIds = img ? [await uploadPicture(await input.download(img.path), post.title ?? card.hook)] : [];
      const res = await deps.http.write<{ id: string; url?: string }>("POST", `${instance()}/api/v1/statuses`, {
        headers: { ...auth(), "Idempotency-Key": `studio-${post.id}` },
        json: { status: post.caption ?? "", language: post.language, visibility: "public", media_ids: mediaIds },
      });
      return { id: res.id, url: res.url ?? null };
    },

    async numbers(post: PostRow): Promise<Numbers | null> {
      if (!post.platform_post_id) return null;
      const s = await deps.http.get<{ favourites_count?: number; reblogs_count?: number; replies_count?: number }>(`${instance()}/api/v1/statuses/${post.platform_post_id}`, auth());
      return { views: null, likes: s.favourites_count ?? null, comments: s.replies_count ?? null, shares: s.reblogs_count ?? null, saves: null, link_taps: null };
    },

    async comments(since: Date, pieces: ReadonlyMap<string, string>): Promise<NewReply[]> {
      const list = await deps.http.get<{ type: string; created_at: string; account?: { id?: string; acct?: string }; status?: { id: string; content?: string; in_reply_to_id?: string | null; language?: string | null; created_at?: string } }[]>(
        `${instance()}/api/v1/notifications?types[]=mention&limit=40`,
        auth(),
      );
      const out: NewReply[] = [];
      for (const n of Array.isArray(list) ? list : []) {
        if (n.type !== "mention" || !n.status || new Date(n.created_at) <= since) continue;
        const parent = n.status.in_reply_to_id ?? null;
        out.push({
          platform: "mastodon",
          thread_ref: n.status.id,
          parent_ref: parent,
          post_id: parent ? (pieces.get(parent) ?? null) : null,
          author_handle: n.account?.acct ?? null,
          author_ref: n.account?.id ?? null,
          their_text: plainText(n.status.content ?? ""),
          their_lang: n.status.language ?? null,
          received_at: n.created_at,
        });
      }
      return out;
    },

    async reply(reply: ReplyRow, text: string): Promise<{ ref: string }> {
      // A reply that doesn't mention its author doesn't reach them on Mastodon.
      const handle = reply.author_handle ? `@${reply.author_handle}` : "";
      const body = handle && !text.includes(handle) ? `${handle} ${text}` : text;
      const res = await deps.http.write<{ id: string }>("POST", `${instance()}/api/v1/statuses`, {
        headers: { ...auth(), "Idempotency-Key": `studio-reply-${reply.id}` },
        json: { status: body, in_reply_to_id: reply.thread_ref, visibility: "public" },
      });
      return { ref: res.id };
    },
  };
}
