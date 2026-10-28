/**
 * The analyst, Friday 07:00 Paris: the week's scorecard computed by code, worded by Opus, with ten ideas
 * for Sunday and three lines for the owner; then the hook bank's results updated, and a reminder at
 * 09:00 that the scorecard is ready.
 */
import type { AgentContext } from "./context";
import { promptFor } from "./context";
import { analystSystem } from "./system";
import { callStructured, StructuredCallError } from "../claude/call";
import { analystOut, type AnalystOut } from "../prompts/schemas";
import { modelCap } from "../caps";
import { withRun, SkipRun } from "../run";
import { computeScorecard, scorecardText, type Scorecard } from "../metrics/scorecard";
import { createAgentReminders } from "../reminders/agent";
import { fromParis, parisDate, parisWeek } from "../time";
import type { Platform } from "../types";
import { isPlatform, PLATFORMS } from "../types";
import { CONNECTION_OF } from "../outbox/types";

export async function gatherScorecard(ctx: AgentContext, to: Date = ctx.now): Promise<Scorecard> {
  const { store, settings, kit } = ctx;
  const from = new Date(to.getTime() - 7 * 86400_000);
  const day = (d: Date) => parisDate(d);
  const fourWeeksBefore = new Date(from.getTime() - 28 * 86400_000);
  const [posts, metrics, earlier, sessions, orders, earlierOrders, runs, connections] = await Promise.all([
    store.posts({ postedFrom: fourWeeksBefore.toISOString() }),
    store.metrics({ from: day(from), to: day(new Date(to.getTime() + 86400_000)) }),
    store.metrics({ from: day(fourWeeksBefore), to: day(from) }),
    store.studySessions({ from: from.toISOString(), to: to.toISOString() }),
    store.orders({ from: from.toISOString(), to: to.toISOString() }),
    store.orders({ from: new Date(from.getTime() - 84 * 86400_000).toISOString(), to: from.toISOString() }),
    store.runs({ since: from.toISOString(), limit: 2000 }),
    store.connections(),
  ]);
  const cards = await store.cards({ ids: [...new Set(posts.map((p) => p.card_id))] });
  const week = parisWeek(to);
  const inputs = await store.weeklyInputs(week);
  const earlierDays = new Set(earlier.map((m) => m.day)).size;
  return computeScorecard(kit, {
    week,
    from,
    to,
    posts,
    cards,
    metrics,
    sessions,
    earlierMetricsDays: earlierDays,
    orders,
    earlierOrders,
    runs: runs.filter((r) => r.started_at < to.toISOString()),
    inputs,
    dailyCap: settings.get("input-study").daily_cap,
    // A connection serves one or more platforms (Meta's serves Instagram and Facebook).
    connected: new Set(
      connections
        .filter((c) => c.status === "connected" || c.status === "expiring")
        .flatMap((c) => PLATFORMS.filter((p) => CONNECTION_OF[p] === c.platform || p === c.platform))
        .filter((p): p is Platform => isPlatform(p)),
    ),
  });
}

/** Each hook's results: the engagements of the cards written from it, the last twenty kept. */
export async function updateHookStats(ctx: AgentContext, card: Scorecard): Promise<number> {
  const { store } = ctx;
  const cards = await store.cards({ ids: card.byHook.map((h) => h.cardId) });
  const hooks = await store.hooks();
  let updated = 0;
  for (const hook of hooks) {
    const mine = card.byHook.filter((h) => cards.find((c) => c.id === h.cardId)?.hook_id === hook.id);
    if (mine.length === 0) continue;
    const results = [...(hook.stats.results ?? []), ...mine.map((h) => h.engagements)].slice(-20);
    const sorted = [...results].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    const med = sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
    await store.updateHook(hook.id, {
      stats: { uses: (hook.stats.uses ?? 0) + mine.length, results, best: Math.max(...results), median: med, last_used: card.week },
    });
    updated += 1;
  }
  return updated;
}

export async function runAnalyst(ctx: AgentContext) {
  const { store, settings, kit } = ctx;
  const conf = settings.get("analyst");
  const modelConf = settings.model("analyst");
  const prompt = await promptFor(store, "analyst", conf.prompt_version);
  return withRun(store, { agent: "analyst", trigger: ctx.trigger, model: modelConf.model, promptVersion: prompt.version }, async (log, run) => {
    if (!conf.enabled) throw new SkipRun("skipped", "the analyst is turned off in Settings");
    const card = await gatherScorecard(ctx);
    log.details["week"] = card.week;
    const hooks = await updateHookStats(ctx, card);
    log.count("studio_hooks", hooks);

    let words: AnalystOut = { verdicts: [], suggestions: [], for_owner: [], reminders: [] };
    const cap = await modelCap(store, settings, "analyst", ctx.now);
    if (!cap.ok || !ctx.transport) {
      // The figures stand on their own: without the model (capped, or no key), the scorecard is saved
      // with the code's verdicts and a line saying why the words are missing.
      log.note(!cap.ok ? cap.reason ?? "capped" : "no model transport: the scorecard is saved without its words");
      words = { ...words, for_owner: [!cap.ok ? `The analyst's words are missing this week: ${cap.reason}.` : "The analyst's words are missing this week: no API key."] };
    } else {
      try {
        const result = await callStructured({
          transport: ctx.transport,
          model: modelConf.model,
          effort: modelConf.effort,
          maxTokens: modelConf.max_tokens,
          fallbacks: modelConf.fallbacks,
          system: analystSystem(prompt.text, kit),
          user: scorecardText(card),
          schema: analystOut,
        });
        log.add(result.usage, result.costUsd, result.model);
        words = result.value;
      } catch (err) {
        if (err instanceof StructuredCallError) log.add(err.usage, err.costUsd);
        log.note(`the analyst's words failed: ${err instanceof Error ? err.message : String(err)}`);
        words = { ...words, for_owner: ["The analyst's words failed this week; the figures and the verdicts below are the code's and stand."] };
      }
    }

    await store.putScorecard({
      week: card.week,
      figures: { ...card.figures, rows: card.rows, by_platform: card.byPlatform, best: card.best, worst: card.worst, missing: card.missing, paid: card.paid } as Record<string, unknown>,
      verdicts: card.verdicts.map((v) => ({ ...v, wording: words.verdicts.find((w) => w.rule === v.rule)?.wording ?? null })),
      suggestions: words.suggestions,
      for_owner: words.for_owner,
      cost_usd: card.costUsd,
      run_id: run.id,
    });
    log.count("studio_scorecards");

    const nine = fromParis(parisDate(ctx.now), "09:00");
    await store.insertReminder({
      kind: "scorecard",
      title: "The scorecard is ready",
      body: words.for_owner.join("\n") || "This week's figures are on the Scorecards tab.",
      due_at: (nine.getTime() > ctx.now.getTime() ? nine : ctx.now).toISOString(),
      channels: ["in_app", "email"],
      linked_table: "studio_scorecards",
      linked_id: card.week,
      link: "/studio/library?tab=scorecards",
      created_by: "analyst",
      dedupe_key: `scorecard:${card.week}`,
    });
    const reminders = await createAgentReminders(store, "analyst", words.reminders, ctx.now, { table: "studio_scorecards", id: card.week });
    for (const r of reminders.refused) log.note(`reminder refused: ${r}`);
    return { outcome: "ok" as const };
  });
}
