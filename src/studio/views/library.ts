/**
 * The Library's tabs, each a filtered list the screen shows as a table or a grid. Every filter is
 * applied here, on the server, so a phone receives only the rows it shows.
 */
import type { AgentContext } from "../agents/context";
import type { CardRow, MetricRow, PostRow } from "../store/rows";
import { ALL_TEMPLATES } from "../templates/registry";
import { daysOf, fromParis, nextWeek, parisWeek, previousWeek } from "../time";
import { isFormat, isLanguage, isPlatform, POST_STATUSES, CARD_STATUSES, PILLARS, type Pillar, type PostStatus, type CardStatus } from "../types";
import { pieceLine, replyLine, replyOrder, type PieceLine, type ReplyLine } from "./shared";

export const LIBRARY_TABS = ["week", "cards", "pieces", "replies", "media", "templates", "hooks", "prompts", "sky", "scorecards", "runs"] as const;
export type LibraryTab = (typeof LIBRARY_TABS)[number];

export interface LibraryQuery {
  readonly tab: LibraryTab;
  readonly week?: string | null;
  readonly pillar?: string | null;
  readonly language?: string | null;
  readonly status?: string | null;
  readonly platform?: string | null;
  readonly format?: string | null;
  readonly q?: string | null;
  readonly agent?: string | null;
  readonly outcome?: string | null;
  readonly month?: string | null;
  readonly failed?: boolean;
}

export interface CardSummary {
  readonly id: string;
  readonly week: string;
  readonly pillar: Pillar;
  readonly language: CardRow["language"];
  readonly hook: string;
  readonly idea: string;
  readonly status: CardStatus;
  readonly anchor: string | null;
  readonly skyDate: string | null;
  readonly parent: string | null;
  readonly hasFigure: boolean;
  readonly reason: string | null;
  readonly pieces: Readonly<Record<string, number>>;
  readonly views: number;
  readonly engagements: number;
  readonly createdAt: string;
}

const weekRange = (week: string) => ({ from: fromParis(daysOf(week)[0]!, "00:00").toISOString(), to: fromParis(daysOf(week)[6]!, "23:59").toISOString() });
const matches = (q: string | null | undefined, ...texts: (string | null | undefined)[]) => !q || texts.some((t) => (t ?? "").toLowerCase().includes(q.toLowerCase()));

function latestMetrics(rows: readonly MetricRow[]): Map<string, MetricRow> {
  const out = new Map<string, MetricRow>();
  for (const m of rows) {
    const prev = out.get(m.post_id);
    if (!prev || m.day > prev.day) out.set(m.post_id, m);
  }
  return out;
}

export async function cardSummaries(ctx: AgentContext, cards: readonly CardRow[]): Promise<CardSummary[]> {
  const posts = cards.length ? await ctx.store.posts({ cardIds: cards.map((c) => c.id), limit: 5000 }) : [];
  const metrics = posts.length ? latestMetrics(await ctx.store.metrics({ from: "2000-01-01", to: "2100-01-01", postIds: posts.map((p) => p.id) })) : new Map<string, MetricRow>();
  return cards.map((c) => {
    const mine = posts.filter((p) => p.card_id === c.id);
    const pieces: Record<string, number> = {};
    for (const p of mine) pieces[p.status] = (pieces[p.status] ?? 0) + 1;
    const ms = mine.map((p) => metrics.get(p.id)).filter((m): m is MetricRow => !!m);
    return {
      id: c.id,
      week: c.week,
      pillar: c.pillar,
      language: c.language,
      hook: c.hook,
      idea: c.idea,
      status: c.status,
      anchor: c.anchor,
      skyDate: c.sky_date,
      parent: c.parent,
      hasFigure: c.figures.length > 0,
      reason: c.reason,
      pieces,
      views: ms.reduce((n, m) => n + (m.views ?? 0), 0),
      engagements: ms.reduce((n, m) => n + (m.likes ?? 0) + (m.comments ?? 0) + (m.shares ?? 0) + (m.saves ?? 0), 0),
      createdAt: c.created_at,
    };
  });
}

export interface WeekGroup {
  readonly card: CardSummary;
  readonly pieces: readonly PieceLine[];
}

export async function libraryView(ctx: AgentContext, q: LibraryQuery): Promise<{ tab: LibraryTab; rows: unknown[]; weeks: string[] }> {
  const { store, settings, now } = ctx;
  const thisWeek = parisWeek(now);
  const weeks = [previousWeek(previousWeek(thisWeek)), previousWeek(thisWeek), thisWeek, nextWeek(thisWeek)];
  const pillar = q.pillar && (PILLARS as readonly string[]).includes(q.pillar) ? (q.pillar as Pillar) : undefined;
  const byHand = (p: PostRow) => settings.postingMode(p.platform) !== "api";

  switch (q.tab) {
    case "week":
    case "cards": {
      const week = q.week ?? (q.tab === "week" ? weeks[3]! : null);
      const statuses = q.status && (CARD_STATUSES as readonly string[]).includes(q.status) ? [q.status as CardStatus] : undefined;
      let cards = await store.cards({ weeks: week ? [week] : undefined, statuses, pillar, language: q.language ?? undefined, limit: 1000 });
      cards = cards.filter((c) => matches(q.q, c.hook, c.idea));
      if (q.tab === "cards") return { tab: q.tab, rows: await cardSummaries(ctx, cards), weeks };
      const summaries = await cardSummaries(ctx, cards);
      const posts = cards.length ? await store.posts({ cardIds: cards.map((c) => c.id), limit: 5000 }) : [];
      const media = posts.length ? await store.media({ postIds: posts.map((p) => p.id) }) : [];
      const byId = new Map(cards.map((c) => [c.id, c]));
      const groups: WeekGroup[] = summaries.map((card) => ({
        card,
        pieces: posts.filter((p) => p.card_id === card.id && p.status !== "killed").map((p) => pieceLine(p, byId.get(p.card_id), media, byHand(p))).sort((a, b) => (a.scheduledAt ?? "").localeCompare(b.scheduledAt ?? "")),
      }));
      return { tab: q.tab, rows: groups, weeks };
    }
    case "pieces": {
      const range = q.week ? weekRange(q.week) : null;
      const posts = await store.posts({
        statuses: q.status && (POST_STATUSES as readonly string[]).includes(q.status) ? [q.status as PostStatus] : undefined,
        platforms: isPlatform(q.platform) ? [q.platform] : undefined,
        formats: isFormat(q.format) ? [q.format] : undefined,
        language: isLanguage(q.language) ? q.language : undefined,
        scheduledFrom: range?.from,
        scheduledTo: range?.to,
        limit: 2000,
      });
      const filtered = posts.filter((p) => (!q.failed || (p.gate && !p.gate.ok) || p.status === "failed") && matches(q.q, p.caption, p.title, p.script, p.description));
      const cards = await store.cards({ ids: [...new Set(filtered.map((p) => p.card_id))] });
      const media = filtered.length ? await store.media({ postIds: filtered.map((p) => p.id) }) : [];
      const byId = new Map(cards.map((c) => [c.id, c]));
      return { tab: q.tab, rows: filtered.map((p) => pieceLine(p, byId.get(p.card_id), media, byHand(p))).sort((a, b) => (a.scheduledAt ?? "").localeCompare(b.scheduledAt ?? "")), weeks };
    }
    case "replies": {
      const rows = await store.replies({ statuses: q.status === "all" ? undefined : q.status ? [q.status as ReplyLine["status"]] : ["draft", "approved"], platform: q.platform ?? undefined, limit: 500 });
      return { tab: q.tab, rows: rows.filter((r) => r.klass !== "spam" || q.status === "skipped").sort(replyOrder).map(replyLine), weeks };
    }
    case "media": {
      const range = q.week ? weekRange(q.week) : null;
      const posts = await store.posts({ scheduledFrom: range?.from, scheduledTo: range?.to, formats: isFormat(q.format) ? [q.format] : undefined, limit: 2000 });
      const media = posts.length ? await store.media({ postIds: posts.map((p) => p.id), kinds: ["video", "image", "thumbnail", "srt"] }) : [];
      const byPost = new Map(posts.map((p) => [p.id, p]));
      return {
        tab: q.tab,
        rows: media.map((m) => {
          const p = m.post_id ? byPost.get(m.post_id) : undefined;
          return { id: m.id, kind: m.kind, path: m.path, bytes: m.bytes, durationMs: m.duration_ms, width: m.width, height: m.height, pieceId: m.post_id, platform: p?.platform ?? null, format: p?.format ?? null, status: p?.status ?? null, template: (m.meta as Record<string, unknown>)["template"] ?? null, createdAt: m.created_at };
        }),
        weeks,
      };
    }
    case "templates": {
      const saved = await store.templates();
      return { tab: q.tab, rows: [...ALL_TEMPLATES.map((t) => ({ ...t, saved: false, isDefault: false })), ...saved.map((t) => ({ id: t.id, kind: "preset", label: t.name, base: t.base, saved: true, isDefault: t.is_default, spec: t.spec, createdAt: t.created_at }))], weeks };
    }
    case "hooks": {
      const hooks = await store.hooks({ language: isLanguage(q.language) ? q.language : undefined, pillar, retired: q.status === "retired" ? true : q.status === "all" ? undefined : false });
      return { tab: q.tab, rows: hooks.filter((h) => matches(q.q, h.text)).map((h) => ({ id: h.id, text: h.text, pillar: h.pillar, language: h.language, retired: h.retired, uses: h.stats.uses ?? 0, best: h.stats.best ?? null, median: h.stats.median ?? null, lastUsed: h.stats.last_used ?? null, source: h.source })), weeks };
    }
    case "prompts": {
      const rows = await store.prompts(q.agent ?? undefined);
      return { tab: q.tab, rows: rows.map((p) => ({ agent: p.agent, version: p.version, note: p.note, createdAt: p.created_at, createdBy: p.created_by, length: p.text.length })), weeks };
    }
    case "sky": {
      const month = q.month && /^\d{4}-\d{2}$/.test(q.month) ? q.month : now.toISOString().slice(0, 7);
      const [y, m] = month.split("-").map(Number);
      const from = `${month}-01`;
      const to = new Date(Date.UTC(y!, m!, 1)).toISOString().slice(0, 10);
      const [sky, calendar] = await Promise.all([store.sky({ from, to }), store.calendar({ from, to })]);
      return { tab: q.tab, rows: [{ month, sky, calendar }], weeks };
    }
    case "scorecards":
      return { tab: q.tab, rows: await store.scorecards(26), weeks };
    case "runs": {
      const rows = await store.runs({ agent: q.agent ?? undefined, outcome: (q.outcome as never) ?? undefined, since: q.week ? weekRange(q.week).from : new Date(now.getTime() - 30 * 86400_000).toISOString(), limit: 500 });
      return { tab: q.tab, rows: rows.filter((r) => q.agent === "tick" || r.agent !== "tick"), weeks };
    }
  }
}
