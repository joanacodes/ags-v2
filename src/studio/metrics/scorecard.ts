/**
 * Friday's scorecard, computed. Every figure is counted from the tables (posts, metrics, the Study's
 * sessions, orders, runs, the owner's Friday inputs) and every keep-or-kill rule is applied by code, so
 * the analyst model only words what is already true. A platform with no numbers is listed as missing,
 * never estimated.
 */
import type { Kit } from "../kit/schema";
import type { CardRow, MetricRow, OrderRow, PostRow, RunRow, StudySessionRow, WeeklyInputRow } from "../store/rows";
import type { Platform } from "../types";
import { PLATFORMS, PLATFORM_LABELS } from "../types";
import { parisDate } from "../time";

export interface ScoreRow {
  readonly measure: string;
  readonly value: string;
  readonly target: string;
  readonly where: string;
}

export interface Verdict {
  readonly rule: string;
  readonly triggered: boolean;
  readonly number: string;
  readonly action: string;
}

export interface PlatformLine {
  readonly platform: Platform;
  readonly posted: number;
  readonly views: number | null;
  readonly engagements: number | null;
  readonly tests: number;
  readonly missing: boolean;
}

export interface HookLine {
  readonly hook: string;
  readonly cardId: string;
  readonly engagements: number;
  readonly views: number;
}

export interface Scorecard {
  readonly week: string;
  readonly from: string;
  readonly to: string;
  readonly rows: ScoreRow[];
  readonly byPlatform: PlatformLine[];
  readonly byHook: HookLine[];
  readonly best: HookLine[];
  readonly worst: HookLine[];
  readonly verdicts: Verdict[];
  readonly paid: { costPerTestGbp: number | null; verdict: string };
  readonly costUsd: number;
  readonly figures: Record<string, number | string>;
  readonly missing: string[];
}

export interface ScorecardInputs {
  readonly week: string;
  readonly from: Date;
  readonly to: Date;
  readonly posts: readonly PostRow[];
  readonly cards: readonly CardRow[];
  readonly metrics: readonly MetricRow[];
  readonly sessions: readonly StudySessionRow[];
  /** The four weeks before, for the "two weeks of data" and "no sale in four weeks" rules. */
  readonly earlierMetricsDays: number;
  readonly orders: readonly OrderRow[];
  readonly earlierOrders: readonly OrderRow[];
  readonly runs: readonly RunRow[];
  readonly inputs: WeeklyInputRow | null;
  readonly dailyCap: number;
  readonly connected: ReadonlySet<Platform>;
}

const engagementsOf = (m: MetricRow) => (m.likes ?? 0) + (m.comments ?? 0) + (m.shares ?? 0) + (m.saves ?? 0);
const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2));
const pct = (n: number, d: number) => (d === 0 ? "–" : `${((n / d) * 100).toFixed(1)}%`);
const range = (r: unknown) => (Array.isArray(r) ? `${r[0]}–${r[1]}` : typeof r === "number" ? (r < 1 ? `${Math.round(r * 100)}%+` : String(r)) : "–");

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

/** The src tag a platform's links carry, so tests can be counted per platform. */
function srcOf(kit: Kit, platform: Platform): string[] {
  const src = kit.platforms[platform]?.src;
  if (!src) return [];
  return platform === "instagram" ? [src, "igdm"] : [src];
}

export function computeScorecard(kit: Kit, s: ScorecardInputs): Scorecard {
  const targets = kit.scorecard.targets;
  const rules = kit.scorecard.rules;
  const posted = s.posts.filter((p) => p.status === "posted" && p.posted_at && p.posted_at >= s.from.toISOString() && p.posted_at < s.to.toISOString());
  const metricsByPost = new Map<string, MetricRow>();
  for (const m of s.metrics) {
    // The latest day per post: platforms report running totals.
    const prev = metricsByPost.get(m.post_id);
    if (!prev || m.day > prev.day) metricsByPost.set(m.post_id, m);
  }
  const real = s.sessions.filter((x) => x.status !== "building");
  const finished = real.filter((x) => x.status === "finished");
  const testsBySrc = new Map<string, number>();
  for (const x of real) testsBySrc.set((x.source ?? "direct").toLowerCase(), (testsBySrc.get((x.source ?? "direct").toLowerCase()) ?? 0) + 1);

  const byPlatform: PlatformLine[] = PLATFORMS.filter((p) => posted.some((x) => x.platform === p) || s.connected.has(p)).map((platform) => {
    const mine = posted.filter((p) => p.platform === platform);
    const ms = mine.map((p) => metricsByPost.get(p.id)).filter((m): m is MetricRow => !!m);
    const missing = mine.length > 0 && ms.length === 0;
    return {
      platform,
      posted: mine.length,
      views: ms.length ? ms.reduce((n, m) => n + (m.views ?? 0), 0) : null,
      engagements: ms.length ? ms.reduce((n, m) => n + engagementsOf(m), 0) : null,
      tests: srcOf(kit, platform).reduce((n, src) => n + (testsBySrc.get(src) ?? 0), 0),
      missing,
    };
  });
  const totalEng = byPlatform.reduce((n, p) => n + (p.engagements ?? 0), 0);
  const totalViews = byPlatform.reduce((n, p) => n + (p.views ?? 0), 0);
  const keywordComments = [...metricsByPost.values()].reduce((n, m) => n + (m.keyword_comments ?? 0), 0);
  const optIns = real.filter((x) => x.news_consent_at !== null).length;
  const sales = s.orders.filter((o) => o.status === "complete" || o.status === "paid" || o.status === null);
  const salesTotal = sales.reduce((n, o) => n + o.amount, 0) / 100;
  const cost = s.runs.reduce((n, r) => n + r.cost_usd, 0);
  const manual = (s.inputs?.manual ?? {}) as Record<string, unknown>;
  const openRate = typeof manual["email_open_rate"] === "number" ? (manual["email_open_rate"] as number) : null;
  const clickRate = typeof manual["email_click_rate"] === "number" ? (manual["email_click_rate"] as number) : null;
  const dms = s.inputs?.dm_count ?? null;

  const byCard = new Map<string, HookLine>();
  for (const p of posted) {
    const m = metricsByPost.get(p.id);
    const card = s.cards.find((c) => c.id === p.card_id);
    if (!card) continue;
    const line = byCard.get(card.id) ?? { hook: card.hook, cardId: card.id, engagements: 0, views: 0 };
    byCard.set(card.id, { ...line, engagements: line.engagements + (m ? engagementsOf(m) : 0), views: line.views + (m?.views ?? 0) });
  }
  const byHook = [...byCard.values()].sort((a, b) => b.engagements - a.engagements);
  const withNumbers = byHook.filter((h) => h.views > 0);

  const count = (f: (p: PostRow) => boolean) => posted.filter(f).length;
  const rows: ScoreRow[] = [
    { measure: "Videos posted", value: String(count((p) => p.format === "video")), target: range(targets["videos"]), where: "the outbox" },
    { measure: "Pins posted", value: String(count((p) => p.format === "pin")), target: range(targets["pins"]), where: "the outbox" },
    { measure: "Text posts posted", value: String(count((p) => p.format === "text")), target: range(targets["text_posts"]), where: "the outbox" },
    { measure: "Views", value: String(totalViews), target: "–", where: "each platform's insights" },
    { measure: "Engagements", value: String(totalEng), target: range(targets["engagements"]), where: "each platform's insights" },
    { measure: "Keyword comments", value: String(keywordComments), target: range(targets["keyword_comments_and_dms"]), where: "the comments pull" },
    { measure: "DMs sent", value: dms === null ? "missing (Friday field)" : String(dms), target: range(targets["keyword_comments_and_dms"]), where: "ManyChat, typed on Friday" },
    { measure: "Tests started", value: String(real.length), target: range(targets["tests"]), where: "the Study" },
    { measure: "Tests finished", value: String(finished.length), target: "–", where: "the Study" },
    { measure: "News opt-in rate", value: pct(optIns, real.length), target: range(targets["opt_in_rate"]), where: "the Study" },
    { measure: "Email open rate", value: openRate === null ? "missing" : `${(openRate * 100).toFixed(1)}%`, target: range(targets["email_open_rate"]), where: "MailerLite" },
    { measure: "Email click rate", value: clickRate === null ? "missing" : `${(clickRate * 100).toFixed(1)}%`, target: range(targets["email_click_rate"]), where: "MailerLite" },
    { measure: "Orders", value: String(sales.length), target: range(targets["orders"]), where: "Stripe" },
    { measure: "Sales (£)", value: fmt(salesTotal), target: range(targets["sales_gbp"]), where: "Stripe" },
    { measure: "Owner's hours", value: s.inputs?.owner_hours === null || s.inputs?.owner_hours === undefined ? "missing (Friday field)" : fmt(s.inputs.owner_hours), target: `≤ ${targets["owner_hours_max"] ?? 12}`, where: "typed on Friday" },
    { measure: "Model spend ($)", value: cost.toFixed(2), target: "≤ the cap", where: "studio_runs" },
  ];

  const verdicts: Verdict[] = [];
  const enoughData = s.earlierMetricsDays >= 7;
  for (const p of byPlatform) {
    if (p.posted === 0) continue;
    const testShare = real.length ? p.tests / real.length : 0;
    const engShare = totalEng ? (p.engagements ?? 0) / totalEng : 0;
    const triggered = enoughData && !p.missing && testShare < rules.cross_post_only.tests_share_below && engShare < rules.cross_post_only.engagement_share_below;
    verdicts.push({
      rule: `cross-post only: ${PLATFORM_LABELS[p.platform]}`,
      triggered,
      number: `${(testShare * 100).toFixed(1)}% of tests, ${(engShare * 100).toFixed(1)}% of engagements`,
      action: triggered ? `${PLATFORM_LABELS[p.platform]} becomes cross-post only: no native time` : "keep",
    });
  }
  const med = median(withNumbers.map((h) => h.engagements));
  for (const h of withNumbers) {
    if (med > 0 && h.engagements >= rules.repeat_hook.multiple_of_median * med) {
      verdicts.push({ rule: "repeat the hook", triggered: true, number: `${h.engagements} engagements, median ${fmt(med)}`, action: `"${h.hook}" gets ${rules.repeat_hook.variants} variants next week` });
    }
  }
  for (const p of posted.filter((x) => x.format === "video")) {
    const m = metricsByPost.get(p.id);
    if (!m?.views) continue;
    const rate = (m.comments ?? 0) / m.views;
    if (rate > rules.paid_push.comment_rate_above) {
      verdicts.push({ rule: "the paid push", triggered: true, number: `comment rate ${(rate * 100).toFixed(2)}% on ${m.views} views`, action: `a candidate for the paid push (${PLATFORM_LABELS[p.platform]}, check completion above ${Math.round(rules.paid_push.completion_above * 100)}% in its insights)` });
    }
  }
  if (clickRate !== null) {
    const triggered = clickRate < rules.rewrite_email.click_below;
    verdicts.push({ rule: "rewrite the email", triggered, number: `${(clickRate * 100).toFixed(1)}% clicks`, action: triggered ? "the sequence email under 1% click is rewritten" : "keep" });
  }
  const perDay = new Map<string, number>();
  for (const x of real) perDay.set(parisDate(new Date(x.created_at)), (perDay.get(parisDate(new Date(x.created_at))) ?? 0) + 1);
  const capDays = [...perDay.values()].filter((n) => n >= s.dailyCap).length;
  verdicts.push({
    rule: "raise the test's cap",
    triggered: capDays >= rules.raise_cap.cap_days_per_week,
    number: `${capDays} day(s) at the cap of ${s.dailyCap}`,
    action: capDays >= rules.raise_cap.cap_days_per_week ? "raise the daily cap in AGS (an owner decision: it costs API money)" : "keep",
  });
  const products = new Set(s.earlierOrders.map((o) => o.product).filter((p): p is string => !!p));
  for (const product of products) {
    const sold = [...s.orders, ...s.earlierOrders].some((o) => o.product === product && o.created >= new Date(s.to.getTime() - rules.pull_product.weeks_without_sale * 7 * 86400_000).toISOString());
    if (!sold) verdicts.push({ rule: "pull a product from the emails", triggered: true, number: `no sale in ${rules.pull_product.weeks_without_sale} weeks`, action: `${product}: out of the emails (not off the site) — the owner decides` });
  }

  const adTests = testsBySrc.get("ad") ?? 0;
  const adSpend = typeof manual["ad_spend_gbp"] === "number" ? (manual["ad_spend_gbp"] as number) : null;
  const costPerTest = adSpend !== null && adTests > 0 ? adSpend / adTests : null;
  const paid = {
    costPerTestGbp: costPerTest,
    verdict:
      adSpend === null
        ? "no paid push this week (or its spend wasn't typed on Friday)"
        : costPerTest === null
          ? `£${fmt(adSpend)} spent, no test from src=ad yet`
          : costPerTest > kit.scorecard.paid.stop_cost_per_test_gbp
            ? `stop: £${costPerTest.toFixed(2)} a test is above £${kit.scorecard.paid.stop_cost_per_test_gbp}`
            : `go on: £${costPerTest.toFixed(2)} a test`,
  };

  const missing = byPlatform.filter((p) => p.missing).map((p) => PLATFORM_LABELS[p.platform]);
  const figures: Record<string, number | string> = {
    tests_started: real.length,
    tests_finished: finished.length,
    opt_in_rate: pct(optIns, real.length),
    engagements: totalEng,
    views: totalViews,
    orders: sales.length,
    sales_gbp: Number(salesTotal.toFixed(2)),
    model_spend_usd: Number(cost.toFixed(4)),
  };
  return {
    week: s.week,
    from: s.from.toISOString(),
    to: s.to.toISOString(),
    rows,
    byPlatform,
    byHook,
    best: withNumbers.slice(0, 3),
    worst: withNumbers.slice(-3).reverse(),
    verdicts,
    paid,
    costUsd: cost,
    figures,
    missing,
  };
}

/** The scorecard as the analyst model reads it. */
export function scorecardText(card: Scorecard): string {
  return [
    `<scorecard week="${card.week}">`,
    ...card.rows.map((r) => `${r.measure}: ${r.value} (target ${r.target}; from ${r.where})`),
    "",
    "By platform:",
    ...card.byPlatform.map((p) => `${PLATFORM_LABELS[p.platform]}: ${p.posted} posted, ${p.views ?? "missing"} views, ${p.engagements ?? "missing"} engagements, ${p.tests} tests`),
    "",
    "Best hooks:",
    ...card.best.map((h) => `${h.engagements} engagements, ${h.views} views: ${h.hook}`),
    "Worst hooks:",
    ...card.worst.map((h) => `${h.engagements} engagements, ${h.views} views: ${h.hook}`),
    "",
    "Rules:",
    ...card.verdicts.map((v) => `${v.rule} — ${v.triggered ? "TRIGGERED" : "not triggered"} — ${v.number} — ${v.action}`),
    "",
    `Paid push: ${card.paid.verdict}`,
    card.missing.length ? `Missing numbers: ${card.missing.join(", ")}` : "No platform is missing numbers.",
    "</scorecard>",
  ].join("\n");
}
