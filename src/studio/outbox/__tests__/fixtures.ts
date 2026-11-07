/** Pieces, media and tokens for the outbox tests: one realistic piece per platform. */
import type { CardRow, MediaRow, PostRow } from "../../store/rows";
import type { Format, Platform } from "../../types";
import type { Token } from "../types";

export const NOW = new Date("2026-11-12T09:00:00Z");
const at = NOW.toISOString();
const later = new Date(NOW.getTime() + 30 * 86400_000).toISOString();

export const TOKENS: Record<string, Token> = {
  meta: { access_token: "user-token", expires_at: null, account: { page_id: "page-1", page_token: "page-token", ig_user_id: "ig-1", ig_username: "theastrostudy" } },
  threads: { access_token: "th-token", expires_at: later, account: { user_id: "th-1", username: "theastrostudy" } },
  youtube: { access_token: "yt-token", refresh_token: "yt-refresh", expires_at: later, account: { channel_id: "UC1" } },
  pinterest: { access_token: "pin-token", refresh_token: "pin-refresh", expires_at: later, account: { username: "theastrostudy" } },
  bluesky: { access_token: "app-password", expires_at: null, account: { handle: "astrostudy.bsky.social", service: "https://bsky.social" } },
  mastodon: { access_token: "masto-token", expires_at: null, account: { instance: "https://mastodon.social", user_id: "1" } },
  x: { access_token: "x-token", refresh_token: "x-refresh", expires_at: later, account: { user_id: "x-1", username: "theastrostudy" } },
  tiktok: { access_token: "tt-token", refresh_token: "tt-refresh", expires_at: later, account: { open_id: "open-1", username: "theastrostudy" } },
};

/** The format each platform's test piece takes: the hardest path each client has. */
export const FORMAT_OF: Record<string, Format> = {
  instagram: "video",
  facebook: "video",
  threads: "text",
  youtube: "video",
  pinterest: "pin",
  bluesky: "text",
  mastodon: "text",
  x: "text",
  tiktok: "video",
};

export function card(over: Partial<CardRow> = {}): CardRow {
  return {
    id: "card-1",
    week: "2026-W46",
    pillar: "test",
    language: "en",
    idea: "Three statements, one is yours",
    hook: "Could you pick your own chart out of three?",
    points: [],
    figures: [],
    cta: "test",
    anchor: null,
    sky_date: null,
    formats: [],
    src: null,
    kit_version: 1,
    prompt_version: 1,
    parent: null,
    hook_id: null,
    status: "approved",
    reason: null,
    run_id: null,
    created_by: "strategist",
    approved_at: at,
    approved_by: "owner-uuid",
    updated_by: "owner",
    created_at: at,
    updated_at: at,
    ...over,
  };
}

export function post(platform: Platform, over: Partial<PostRow> = {}): PostRow {
  const format = FORMAT_OF[platform] ?? "text";
  return {
    id: `post-${platform}`,
    card_id: "card-1",
    platform,
    format,
    language: "en",
    script: format === "video" ? "Astrology test: three statements, one is from your chart." : null,
    lines: null,
    caption: "Three statements. One is from your chart. Could you tell? https://astrostudy.co.uk/test/?src=bs #astrology",
    title: "Could you pick your own chart?",
    description: "Astrology test: three statements, one from your chart. Astrology, tested.",
    tags: ["#astrology", "#birthchart"],
    slides: null,
    spec: { link: "https://astrostudy.co.uk/test/?src=pin" },
    disclosure: format === "video",
    scheduled_at: new Date(NOW.getTime() + 5 * 60_000).toISOString(),
    status: "rendered",
    gate: null,
    by_hand: false,
    platform_post_id: null,
    platform_url: null,
    platform_state: null,
    posted_at: null,
    error: null,
    retries: 0,
    approved_at: at,
    approved_by: "owner-uuid",
    confirmed_at: at,
    run_id: null,
    updated_by: "owner",
    created_at: at,
    updated_at: at,
    ...over,
  };
}

export function mediaFor(p: PostRow): MediaRow[] {
  const base = { post_id: p.id, bytes: 1024, duration_ms: null, sha256: null, meta: {}, created_at: at };
  if (p.format === "video") return [{ ...base, id: `m-${p.id}`, kind: "video", path: `2026-W46/card-1/${p.id}.mp4`, width: 1080, height: 1920, duration_ms: 30000 }];
  if (p.format === "pin") return [{ ...base, id: `m-${p.id}`, kind: "image", path: `2026-W46/card-1/${p.id}.jpg`, width: 1000, height: 1500 }];
  if (["bluesky", "mastodon", "x", "facebook"].includes(p.platform)) return [{ ...base, id: `m-${p.id}`, kind: "image", path: `2026-W46/card-1/${p.id}.jpg`, width: 1080, height: 1080 }];
  return [];
}
