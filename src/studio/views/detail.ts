/** A card's page and a piece's page: everything about one thing, with its history. */
import type { AgentContext } from "../agents/context";
import type { CardRow, EventRow, MediaRow, MetricRow, PostRow } from "../store/rows";
import { pieceLine, type PieceLine } from "./shared";

export interface MediaView {
  readonly id: string;
  readonly kind: MediaRow["kind"];
  readonly url: string | null;
  readonly path: string;
  readonly width: number | null;
  readonly height: number | null;
  readonly durationMs: number | null;
  readonly bytes: number;
}

export interface PieceDetail {
  readonly line: PieceLine;
  readonly post: PostRow;
  readonly card: CardRow | null;
  readonly media: readonly MediaView[];
  readonly metrics: readonly MetricRow[];
  readonly history: readonly EventRow[];
}

export interface CardDetail {
  readonly card: CardRow;
  readonly pieces: readonly PieceDetail[];
  readonly history: readonly EventRow[];
  readonly variants: readonly { readonly id: string; readonly hook: string; readonly week: string }[];
}

const SIGNED = 3600;

async function mediaViews(ctx: AgentContext, media: readonly MediaRow[]): Promise<MediaView[]> {
  return Promise.all(
    media.map(async (m) => ({
      id: m.id,
      kind: m.kind,
      url: await ctx.storage.signedUrl(m.path, SIGNED).catch(() => null),
      path: m.path,
      width: m.width,
      height: m.height,
      durationMs: m.duration_ms,
      bytes: m.bytes,
    })),
  );
}

async function detailOf(ctx: AgentContext, post: PostRow, card: CardRow | null): Promise<PieceDetail> {
  const { store, settings } = ctx;
  const [media, metrics, history] = await Promise.all([
    store.media({ postIds: [post.id] }),
    store.metrics({ from: "2000-01-01", to: "2100-01-01", postIds: [post.id] }),
    store.events({ rowId: post.id, limit: 200 }),
  ]);
  return {
    line: pieceLine(post, card ?? undefined, media, settings.postingMode(post.platform) !== "api"),
    post,
    card,
    media: await mediaViews(ctx, media),
    metrics: [...metrics].sort((a, b) => a.day.localeCompare(b.day)),
    history: [...history].sort((a, b) => a.at.localeCompare(b.at)),
  };
}

export async function pieceDetail(ctx: AgentContext, id: string): Promise<PieceDetail | null> {
  const post = (await ctx.store.posts({ ids: [id] }))[0];
  if (!post) return null;
  const card = (await ctx.store.cards({ ids: [post.card_id] }))[0] ?? null;
  return detailOf(ctx, post, card);
}

export async function cardDetail(ctx: AgentContext, id: string): Promise<CardDetail | null> {
  const card = (await ctx.store.cards({ ids: [id] }))[0];
  if (!card) return null;
  const [posts, history, variants] = await Promise.all([ctx.store.posts({ cardIds: [id], limit: 500 }), ctx.store.events({ rowId: id, limit: 200 }), ctx.store.cards({ parent: id, limit: 50 })]);
  const order = (p: PostRow) => `${p.platform}|${p.format}|${p.language}`;
  const pieces = await Promise.all([...posts].sort((a, b) => order(a).localeCompare(order(b))).map((p) => detailOf(ctx, p, card)));
  return { card, pieces, history: [...history].sort((a, b) => a.at.localeCompare(b.at)), variants: variants.map((v) => ({ id: v.id, hook: v.hook, week: v.week })) };
}
