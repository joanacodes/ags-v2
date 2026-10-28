/**
 * The strategist: Sunday 06:00 Paris, the week after's cards. It reads the week's sky and calendar, the
 * Study's figures, the last scorecard, the hook bank with its results, the hooks of the last eight weeks
 * and the site's pages; Opus answers with the cards; the code holds the answer to the plan's rules (count,
 * pillar shares, timely events, no near-copy hooks, figures only from the inputs) with one retry, then
 * saves the cards as drafts and hands them to the writers.
 */
import type { AgentContext } from "./context";
import { promptFor } from "./context";
import { strategistSystem } from "./system";
import { closest, similarity } from "./similarity";
import { callStructured, StructuredCallError } from "../claude/call";
import { strategistOut, type CardOut, type StrategistOut } from "../prompts/schemas";
import { modelCap } from "../caps";
import { withRun, SkipRun, type RunLog } from "../run";
import { addDays, daysOf, describeParis, mondayOf, nextWeek, parisDate, parisWeek, previousWeek } from "../time";
import { summariseStudy, figureLines } from "../inputs/study";
import { ensureSeeds } from "./seed";
import { createAgentReminders } from "../reminders/agent";
import { PILLARS, type Figure, type Pillar } from "../types";
import type { CardRow, HookRow } from "../store/rows";
import type { NewCard } from "../store/store";
import { writeCards } from "./writers";

export interface StrategistInputs {
  readonly week: string;
  readonly user: string;
  readonly figures: readonly Figure[];
  readonly events: readonly { date: string; event: string }[];
  readonly recentHooks: readonly string[];
  readonly bank: readonly HookRow[];
  readonly winners: readonly HookRow[];
  readonly recentCards: readonly CardRow[];
  readonly cardsMin: number;
  readonly cardsMax: number;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

export async function strategistInputs(ctx: AgentContext, week: string): Promise<StrategistInputs> {
  const { store, settings, kit, now } = ctx;
  const conf = settings.get("strategist");
  const global = settings.get("global");
  const monday = mondayOf(week);
  const windowFrom = addDays(monday, -1);
  const windowTo = addDays(monday, conf.window_days);
  const [sky, calendar] = await Promise.all([store.sky({ from: windowFrom, to: windowTo }), store.calendar({ from: windowFrom, to: windowTo })]);

  const studyWeeks = settings.get("input-study").weeks;
  const studyFrom = new Date(now.getTime() - studyWeeks * 7 * 86400_000).toISOString();
  const sessions = await store.studySessions({ from: studyFrom, to: now.toISOString() });
  const study = summariseStudy(sessions, `${studyWeeks === 1 ? "the 7 days" : `the ${studyWeeks} weeks`} to ${parisDate(now)}`);

  const lastScorecard = (await store.scorecards(1))[0] ?? null;
  const bank = (await store.hooks({ retired: false })).filter((h) => h.language === "en" || h.language === "fr");
  const bests = bank.map((h) => h.stats.best).filter((b): b is number => typeof b === "number" && b > 0);
  const med = median(bests);
  const winners = med > 0 ? bank.filter((h) => (h.stats.best ?? 0) >= 2 * med) : [];

  const eightWeeksAgo = [...Array(8).keys()].reduce((w) => previousWeek(w), week);
  const recentCards = await store.cards({ createdSince: new Date(Date.parse(mondayOf(eightWeeksAgo))).toISOString() });
  const recentHooks = recentCards.filter((c) => c.status !== "killed").map((c) => c.hook);
  const backlog = (await store.cards({ statuses: ["approved"] })).filter((c) => c.week < week).slice(0, conf.backlog_max);

  const sites = Object.entries(settings.get("input-site").sites)
    .filter(([, on]) => on)
    .map(([site]) => site);
  const sources = sites.length ? await store.sources({ sites, limit: 60 }) : [];

  const figures: Figure[] = [...study.figures];
  if (lastScorecard) {
    for (const [key, value] of Object.entries(lastScorecard.figures)) {
      if (typeof value === "number" || typeof value === "string") {
        figures.push({ value: String(value), label: key.replace(/_/g, " "), source: `the scorecard, ${lastScorecard.week}`, verified: true });
      }
    }
  }

  const events = [
    ...sky.map((s) => ({ date: s.date, event: `${s.event}${s.time_paris ? ` at ${s.time_paris.slice(0, 5)} Paris` : ""}${s.source2 ? "" : " (one source only)"}` })),
    ...calendar.map((c) => ({ date: c.date, event: `${c.event}${c.note ? ` — ${c.note}` : ""}` })),
  ].sort((a, b) => a.date.localeCompare(b.date));

  const keywordFrom = global.keyword_from;
  const days = daysOf(week);
  const keywordNote = keywordFrom
    ? days[6]! < keywordFrom
      ? `The keyword starts on ${keywordFrom}: this week is before it, so no card uses a keyword call to action ("comment TEST").`
      : days[0]! >= keywordFrom
        ? `The keyword is on (since ${keywordFrom}): "comment TEST" may be the call to action.`
        : `The keyword starts on ${keywordFrom}, inside this week: cards dated before it use no keyword call to action.`
    : "The keyword is on.";
  const warmup = global.warmup_until && days[0]! <= global.warmup_until ? `New accounts are warming up until ${global.warmup_until}: one video a day per platform until then.` : "";

  const bySource = Object.entries(study.bySource)
    .sort((a, b) => b[1].started - a[1].started)
    .map(([src, n]) => `${src}: ${n.started} started, ${n.finished} finished`)
    .join("\n");

  const user = [
    `<week>${week}: Monday ${days[0]} to Sunday ${days[6]}. Planned on ${describeParis(now)} (Paris).</week>`,
    `<count>Write between ${conf.cards_min} and ${conf.cards_max} cards.</count>`,
    `<keyword>${keywordNote} ${warmup}</keyword>`,
    `<events>\n${events.length ? events.map((e) => `${e.date}: ${e.event}`).join("\n") : "(none in the window)"}\n</events>`,
    `<figures>\nThe only figures you may put on a card, copied exactly (value | label | source):\n${figureLines(figures)}\n</figures>`,
    `<tests_by_source>\n${bySource || "(no tests yet)"}\n</tests_by_source>`,
    lastScorecard
      ? `<last_scorecard week="${lastScorecard.week}">\nSuggestions:\n${(lastScorecard.suggestions as { idea?: string; reason?: string }[]).map((s) => `- ${s.idea ?? ""} (${s.reason ?? ""})`).join("\n")}\nFor the owner:\n${(lastScorecard.for_owner as string[]).join("\n")}\n</last_scorecard>`
      : "<last_scorecard>(none yet)</last_scorecard>",
    `<hook_bank>\nmedian best result: ${med || "no results yet"}\n${bank
      .map((h) => `[${h.language}/${h.pillar}] ${h.text} — uses ${h.stats.uses ?? 0}, best ${h.stats.best ?? "–"}${winners.includes(h) ? " — WINNER: three variants" : ""}`)
      .join("\n")}\n</hook_bank>`,
    `<recent_hooks>\nHooks of the last eight weeks (no near copies unless declared in variant_of):\n${recentHooks.slice(-120).join("\n") || "(none yet)"}\n</recent_hooks>`,
    `<backlog>\n${backlog.length ? backlog.map((c) => `[${c.pillar}] ${c.hook} (approved for ${c.week}, not used: it will be posted this week as written)`).join("\n") : "(empty)"}\n</backlog>`,
    `<sources>\n${sources.length ? sources.map((s) => `[${s.site}/${s.language}] ${s.title}${s.description ? ` — ${s.description}` : ""}${s.url ? ` (${s.url})` : ""}`).join("\n") : "(none listed yet)"}\n</sources>`,
  ].join("\n\n");

  return { week, user, figures, events, recentHooks, bank, winners, recentCards, cardsMin: conf.cards_min, cardsMax: conf.cards_max };
}

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

/** The plan's rules a good answer keeps; each problem is one line the retry is told. */
export function checkCards(out: StrategistOut, inputs: StrategistInputs, shares: Record<Pillar, number>, similarityMax: number): string[] {
  const problems: string[] = [];
  const n = out.cards.length;
  if (n < inputs.cardsMin || n > inputs.cardsMax) problems.push(`there are ${n} cards; the week needs ${inputs.cardsMin} to ${inputs.cardsMax}`);
  for (const pillar of PILLARS) {
    const share = n === 0 ? 0 : (out.cards.filter((c) => c.pillar === pillar).length / n) * 100;
    if (Math.abs(share - shares[pillar]) > 10) problems.push(`the pillar "${pillar}" has ${share.toFixed(0)}% of the cards; the kit says ${shares[pillar]}% (within 10 points)`);
  }
  const known = new Set(inputs.figures.map((f) => norm(f.value)));
  out.cards.forEach((c, i) => {
    for (const f of c.figures) if (!known.has(norm(f.value))) problems.push(`card ${i + 1} ("${c.hook.slice(0, 50)}"): the figure "${f.value}" is not in the inputs' figures`);
    if (!c.variant_of) {
      const near = closest(c.hook, inputs.recentHooks);
      if (near && near.score >= similarityMax) problems.push(`card ${i + 1}: its hook is a near copy (${Math.round(near.score * 100)}%) of a recent one ("${near.text.slice(0, 60)}"); change it or declare it in variant_of`);
    } else {
      const pool = [...inputs.bank.map((h) => h.text), ...inputs.recentHooks];
      const near = closest(c.variant_of, pool);
      if (!near || near.score < 0.9) problems.push(`card ${i + 1}: variant_of must be a hook from the bank or the recent hooks, word for word`);
    }
  });
  for (const e of inputs.events) {
    const covered = out.cards.some((c) => c.sky_date && c.sky_date <= e.date && c.sky_date >= addDays(e.date, -1));
    if (!covered) problems.push(`no card is dated for the event of ${e.date} ("${e.event.slice(0, 60)}")`);
  }
  return problems;
}

/** Keep only what may be kept: figures from the inputs, verified; cards that aren't near copies. */
export function settleCards(out: StrategistOut, inputs: StrategistInputs, similarityMax: number, log?: RunLog): CardOut[] {
  const known = new Map(inputs.figures.map((f) => [norm(f.value), f]));
  const kept: CardOut[] = [];
  for (const c of out.cards) {
    const near = c.variant_of ? null : closest(c.hook, inputs.recentHooks);
    if (near && near.score >= similarityMax) {
      log?.note(`dropped a card whose hook copies a recent one: "${c.hook}"`);
      continue;
    }
    const figures = c.figures.flatMap((f) => {
      const source = known.get(norm(f.value));
      if (!source) {
        log?.note(`dropped an unsourced figure "${f.value}" from "${c.hook}"`);
        return [];
      }
      return [{ ...source }];
    });
    kept.push({ ...c, figures });
  }
  return kept;
}

export async function runStrategist(ctx: AgentContext, options: { write?: boolean; week?: string } = {}) {
  const { store, settings, kit } = ctx;
  const conf = settings.get("strategist");
  const modelConf = settings.model("strategist");
  const prompt = await promptFor(store, "strategist", conf.prompt_version);
  return withRun(store, { agent: "strategist", trigger: ctx.trigger, model: modelConf.model, promptVersion: prompt.version }, async (log, run) => {
    if (!conf.enabled) throw new SkipRun("skipped", "the strategist is turned off in Settings");
    if (settings.get("global").paused) throw new SkipRun("skipped", "the Studio is paused (kill switch)");
    const cap = await modelCap(store, settings, "strategist", ctx.now);
    if (!cap.ok) throw new SkipRun("capped", cap.reason ?? "over the cap");
    if (!ctx.transport) throw new Error("no model transport: ANTHROPIC_API_KEY is not set");

    const seeded = await ensureSeeds(ctx);
    if (seeded.hooks || seeded.calendar || seeded.sky) log.note(`seeded ${seeded.hooks} hooks, ${seeded.calendar} calendar dates, ${seeded.sky} sky events from the kit`);

    const week = options.week ?? nextWeek(parisWeek(ctx.now));
    const inputs = await strategistInputs(ctx, week);
    log.details["week"] = week;
    const shares = Object.fromEntries(kit.pillars.map((p) => [p.id, p.share])) as Record<Pillar, number>;

    let result;
    try {
      result = await callStructured({
        transport: ctx.transport,
        model: modelConf.model,
        effort: modelConf.effort,
        maxTokens: modelConf.max_tokens,
        fallbacks: modelConf.fallbacks,
        system: strategistSystem(prompt.text, kit),
        user: inputs.user,
        schema: strategistOut,
        check: (out) => checkCards(out, inputs, shares, conf.similarity_max),
        attempts: conf.retry === "once" ? 2 : 1,
      });
    } catch (err) {
      if (err instanceof StructuredCallError) log.add(err.usage, err.costUsd);
      throw err;
    }
    log.add(result.usage, result.costUsd, result.model);
    if (result.fellBack) log.note(`the requested model declined; ${result.model} answered`);
    if (result.remaining.length) log.note(`kept after the retry with ${result.remaining.length} rule problems: ${result.remaining.slice(0, 5).join("; ")}`);

    const settled = settleCards(result.value, inputs, conf.similarity_max, log);
    const byHook = (text: string) => inputs.bank.find((h) => similarity(h.text, text) >= 0.9) ?? null;
    const byRecent = (text: string) => inputs.recentCards.find((c) => similarity(c.hook, text) >= 0.9) ?? null;
    const rows: NewCard[] = settled.map((c) => ({
      week,
      pillar: c.pillar,
      language: c.language,
      idea: c.idea,
      hook: c.hook,
      points: c.points,
      figures: c.figures,
      cta: c.cta,
      anchor: c.anchor,
      sky_date: c.sky_date && c.sky_date >= addDays(mondayOf(week), -1) ? c.sky_date : null,
      formats: c.formats,
      kit_version: ctx.kitVersion,
      prompt_version: prompt.version,
      parent: c.variant_of ? byRecent(c.variant_of)?.id ?? null : null,
      hook_id: byHook(c.variant_of ?? c.hook)?.id ?? null,
      status: "draft",
      reason: c.reason,
      run_id: run.id,
      created_by: "strategist",
    }));
    const cards = await store.insertCards(rows, "strategist");
    log.count("studio_cards", cards.length);
    log.note(`${cards.length} cards for ${week}`);

    const reminders = await createAgentReminders(store, "strategist", result.value.reminders, ctx.now, { table: "studio_runs", id: run.id });
    if (reminders.created) log.count("studio_reminders", reminders.created);
    for (const r of reminders.refused) log.note(`reminder refused: ${r}`);

    if ((options.write ?? conf.write_after) && cards.length) {
      // Each writer books its spend on its own run, so every weekly cap reads only its own agent.
      const start = (use: "writer-en" | "writer-fr") => ({ agent: use, trigger: ctx.trigger, model: settings.model(use).model, details: { week, strategist_run: run.id } });
      let written = { pieces: 0, failed: 0, unscheduled: 0 };
      await withRun(store, start("writer-en"), async (en) => {
        const fr = await withRun(store, start("writer-fr"), async (frLog) => {
          written = await writeCards(ctx, cards, { en, fr: frLog }, { runId: run.id });
        });
        if (fr.outcome === "failed") throw new Error(fr.error ?? "the writers failed");
      });
      log.note(`the writers wrote ${written.pieces} pieces (${written.failed} failed the gate, ${written.unscheduled} without a slot)`);
    }
    return { outcome: "ok" as const };
  });
}
