/**
 * Pinterest, through API v5: a pin per piece on the board the kit names for its pillar and language, the
 * picture from a signed URL, the link to the test (or the page) with ?src=pin; the boards made once;
 * impressions, saves and clicks back. A new app has Trial access until Pinterest grants Standard.
 */
import type { PostRow } from "../store/rows";
import { mediaOf, type ClientDeps, type Numbers, type PlatformClient, type PublishInput, type Published, type Token } from "./types";

const API = "https://api.pinterest.com/v5";

/**
 * The access token, refreshed when it is about to lapse. `force` refreshes anyway: Pinterest's refresh
 * token is renewed with each refresh and lapses after 60 idle days, so the maintenance run keeps it warm.
 */
export async function refreshPinterest(deps: ClientDeps, force = false): Promise<string> {
  return accessToken(deps, force);
}

async function accessToken(deps: ClientDeps, force = false): Promise<string> {
  const t = deps.token;
  const fresh = !t.expires_at || Date.parse(t.expires_at) > Date.now() + 600_000;
  if ((fresh && !force) || !t.refresh_token) return t.access_token;
  const basic = Buffer.from(`${process.env.PINTEREST_APP_ID ?? ""}:${process.env.PINTEREST_APP_SECRET ?? ""}`).toString("base64");
  const data = await deps.http
    .signIn<{ access_token: string; expires_in: number; refresh_token?: string; refresh_token_expires_in?: number }>(`${API}/oauth/token`, {
      headers: { Authorization: `Basic ${basic}` },
      form: { grant_type: "refresh_token", refresh_token: t.refresh_token },
    })
    .catch((e: unknown) => {
      throw new Error(`Pinterest refused to refresh its token: reconnect Pinterest in Settings (${e instanceof Error ? e.message : String(e)})`);
    });
  const next: Token = {
    ...t,
    access_token: data.access_token,
    refresh_token: data.refresh_token ?? t.refresh_token,
    expires_at: new Date(Date.now() + data.expires_in * 1000).toISOString(),
    account: { ...t.account, ...(data.refresh_token_expires_in ? { refresh_expires_at: new Date(Date.now() + data.refresh_token_expires_in * 1000).toISOString() } : {}) },
  };
  await deps.saveToken(next);
  return next.access_token;
}

/** The board for a piece: the kit's list per language, by pillar and anchor, else the first. */
export function boardName(boards: readonly string[], anchor: string | null, pillar: string): string {
  const a = (anchor ?? "").toLowerCase();
  const byAnchor = boards.find((b) => a && b.toLowerCase().includes(a.slice(0, 5)));
  if (byAnchor) return byAnchor;
  if (pillar === "test") return boards.find((b) => /test/i.test(b)) ?? boards[0] ?? "The Astro Study";
  if (pillar === "sky") return boards.find((b) => /sky|ciel/i.test(b)) ?? boards[0] ?? "The Astro Study";
  return boards[0] ?? "The Astro Study";
}

export function pinterestClient(deps: ClientDeps, boardsFor: (language: string) => readonly string[]): PlatformClient {
  const auth = async () => ({ Authorization: `Bearer ${await accessToken(deps)}` });
  async function boardId(name: string): Promise<string> {
    const list = await deps.http.get<{ items?: { id: string; name: string }[] }>(`${API}/boards?page_size=100`, await auth());
    const found = list.items?.find((b) => b.name.toLowerCase() === name.toLowerCase());
    if (found) return found.id;
    const made = await deps.http.write<{ id: string }>("POST", `${API}/boards`, { headers: await auth(), json: { name, description: `${name} — The Astro Study`, privacy: "PUBLIC" } });
    return made.id;
  }
  return {
    platform: "pinterest",
    async publish(input: PublishInput): Promise<Published> {
      const { post, card, media } = input;
      const img = mediaOf(media, "image")[0];
      if (!img) throw new Error("no rendered pin");
      const spec = (post.spec ?? {}) as { link?: string };
      const board = await boardId(boardName(boardsFor(post.language), card.anchor, card.pillar));
      const res = await deps.http.write<{ id: string }>("POST", `${API}/pins`, {
        headers: await auth(),
        json: {
          board_id: board,
          title: (post.title ?? "").slice(0, 100),
          description: (post.description ?? "").slice(0, 500),
          link: spec.link ?? undefined,
          alt_text: (post.title ?? card.hook).slice(0, 500),
          media_source: { source_type: "image_url", url: await input.signedUrl(img.path) },
        },
      });
      return { id: res.id, url: `https://www.pinterest.com/pin/${res.id}/` };
    },
    async numbers(post: PostRow): Promise<Numbers | null> {
      if (!post.platform_post_id) return null;
      const end = new Date().toISOString().slice(0, 10);
      const start = (post.posted_at ?? end).slice(0, 10);
      const res = await deps.http.get<{ all?: { lifetime_metrics?: Record<string, number>; summary_metrics?: Record<string, number> } }>(
        `${API}/pins/${post.platform_post_id}/analytics?start_date=${start}&end_date=${end}&metric_types=IMPRESSION,SAVE,PIN_CLICK,OUTBOUND_CLICK`,
        await auth(),
      ).catch(() => null);
      const m = res?.all?.summary_metrics ?? res?.all?.lifetime_metrics;
      if (!m) return null;
      return { views: m["IMPRESSION"] ?? null, likes: null, comments: null, shares: null, saves: m["SAVE"] ?? null, link_taps: m["OUTBOUND_CLICK"] ?? m["PIN_CLICK"] ?? null };
    },
  };
}
