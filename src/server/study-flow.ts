/**
 * The Astro Study test (TASK-0013): what happens when someone starts a test, answers a question,
 * finishes; and how the owner prepares the fake charts. Server-side only. The test itself is taken
 * on the Astro Study site, whose page calls the public routes here: AGS is its back end.
 *
 * Everything runs on the owner's behalf (runAsUser with the secret key), so the participant's chart
 * lands in the owner's library through the same ChartsStore as any other, and its readings are written
 * by the same background jobs.
 */
import { randomUUID } from "node:crypto";
import { runAsUser } from "@/lib/supabase/server";
import { completeMatch, utcOffsetLabel } from "@/lib/geo";
import { ChartsStore, newChartFromDraft } from "@/server/charts-store";
import { PromptsStore } from "@/server/prompts-store";
import { calculateChart } from "@/server/providers/freeastroapi";
import { DEFAULT_AI_MODEL, type AiModelId } from "@/interpretation/ai-models";
import { studyMaterial, writeStatements, type StatementRequest } from "@/interpretation/study-statements";
import { birthDatePassword } from "@/sharing/readee";
import {
  FAKE_CHART_TARGET,
  STUDY_AREAS,
  anchorKey,
  anchorNeedsTime,
  arrangeOptions,
  checkStatement,
  chooseDecoys,
  dayIn,
  dayStartIn,
  fakeBirth,
  isAdultOn,
  planQuiz,
  promptVersion,
  scoreAnswers,
  seededRandom,
  wordCount,
  type DecoyCandidate,
  type Letter,
  type PlannedItem,
  type StudyLanguage,
  type StudyLength,
} from "@/study/quiz";
import {
  StudyStore,
  isStaleBuild,
  studyContext,
  type ItemRow,
  type NewItem,
  type SessionRow,
  type StudyContext,
} from "./study-store";
import type { Chart } from "@/types";

/** At most this many new tests a day (the architect's number), counted in Paris time. */
export const DAILY_LIMIT = 50;
export const STUDY_TIME_ZONE = "Europe/Paris";
/** Fewer questions than this after checks and wrong answers, and the test isn't worth taking. */
const MIN_QUESTIONS = 3;

export type StudyProblem =
  | "not_configured"
  | "full_today"
  | "already_today"
  | "under_18"
  | "place_failed"
  | "chart_failed"
  | "not_ready"
  | "ai_failed"
  | "not_found"
  | "storage_failed";

export type StudyOutcome<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly problem: StudyProblem; readonly detail?: string };

const problem = <T>(p: StudyProblem, detail?: string): StudyOutcome<T> => ({ ok: false, problem: p, detail });

/** The model and prompt every statement is written with, participants' and fake charts' alike. */
async function statementSetup(): Promise<{ system: string; version: string; model: AiModelId }> {
  const prompts = await PromptsStore.getPrompts();
  const system = prompts["study.statements"];
  return { system, version: promptVersion(system), model: DEFAULT_AI_MODEL };
}

/* --------------------------------- starting --------------------------------- */

export interface StartInput {
  readonly name: string;
  readonly email: string;
  readonly birthDate: string;
  readonly birthTime: string | null;
  readonly place: {
    readonly label: string;
    readonly country: string;
    /** Null when the page knew only the coordinates (the Astro Study site's place search). */
    readonly timezone: string | null;
    readonly latitude: number;
    readonly longitude: number;
  };
  readonly length: StudyLength;
  readonly language: StudyLanguage;
  readonly news: boolean;
  readonly source: string | null;
}

/** A start whose birthplace has its timezone. */
type LocatedInput = StartInput & { readonly place: { readonly timezone: string } };

/** The timezone at a birthplace, from its coordinates (Open-Meteo, as the chart wizard does). "" if unknown. */
async function timezoneAt(latitude: number, longitude: number): Promise<string> {
  const found = await completeMatch({
    place: "",
    country: "",
    timezone: "",
    utcOffset: "",
    latitude,
    longitude,
    elevationMeters: 0,
    needsDetails: true,
  });
  return found.timezone;
}

export async function startTest(started: StartInput, now: Date = new Date()): Promise<StudyOutcome<{ sessionId: string }>> {
  const ctx = studyContext();
  if (ctx === null) return problem("not_configured");
  if (!isAdultOn(started.birthDate, dayIn(now, STUDY_TIME_ZONE))) return problem("under_18");
  const timezone = started.place.timezone ?? (await timezoneAt(started.place.latitude, started.place.longitude));
  if (timezone === "") return problem("place_failed");
  const input: LocatedInput = { ...started, place: { ...started.place, timezone } };
  try {
    return await runAsUser(ctx.client, ctx.ownerId, async () => {
      const setup = await statementSetup();
      // No wrong answers written yet with this prompt and model: nothing to build, nothing to spend.
      if ((await StudyStore.countDecoys(ctx, input.language, setup.model, setup.version)) === 0) return problem("not_ready");
      const seed = randomUUID();
      const sessionId = await StudyStore.reserveSession(ctx, {
        name: input.name,
        email: input.email,
        language: input.language,
        length: input.length,
        birthTimeKnown: input.birthTime !== null,
        newsConsent: input.news,
        source: input.source,
        seed,
        model: setup.model,
        promptVersion: setup.version,
      });
      // Counted after taking the place, not before: starts arriving together all see each other, so a
      // burst can't slip past the limit while the first tests are still being built. This one included.
      const dayStart = dayStartIn(now, STUDY_TIME_ZONE);
      const refusal: StudyProblem | null =
        (await StudyStore.countSince(ctx, dayStart)) > DAILY_LIMIT
          ? "full_today"
          : (await StudyStore.countEmailSince(ctx, input.email, dayStart, now)) > 1
            ? "already_today"
            : null;
      const built =
        refusal !== null
          ? problem<{ sessionId: string }>(refusal)
          : await buildTest(ctx, input, setup, seed, sessionId).catch((error: unknown) =>
              problem<{ sessionId: string }>("storage_failed", error instanceof Error ? error.message : String(error)),
            );
      // A refused or failed test gives its place back: it doesn't count towards the day.
      if (!built.ok) await StudyStore.deleteSession(ctx, sessionId).catch(() => undefined);
      return built;
    });
  } catch (error) {
    return problem("storage_failed", error instanceof Error ? error.message : String(error));
  }
}

async function buildTest(
  ctx: StudyContext,
  input: LocatedInput,
  setup: { system: string; version: string; model: AiModelId },
  seed: string,
  sessionId: string,
): Promise<StudyOutcome<{ sessionId: string }>> {
  const created = await ChartsStore.createChart({
    personal: { firstName: input.name, lastName: "" },
    dateTime: { birthDate: input.birthDate, birthTime: input.birthTime ?? undefined, unknownTime: input.birthTime === null },
    location: {
      birthPlace: input.place.label,
      country: input.place.country,
      timezone: input.place.timezone,
      latitude: input.place.latitude,
      longitude: input.place.longitude,
      utcOffset: utcOffsetLabel(input.place.timezone),
    },
    configuration: { houseSystem: "Placidus", language: input.language, aiModel: DEFAULT_AI_MODEL },
    origin: "study",
  });
  const chart = created.chart;
  const discard = async (): Promise<void> => {
    if (created.persisted) await ChartsStore.deleteChart(chart.id).catch(() => undefined);
  };
  if (!created.persisted) return problem("storage_failed", created.storageError);
  if (chart.status !== "active") {
    await discard();
    return problem("chart_failed");
  }

  const timeKnown = chart.birth.timeKnown;
  const materialOf = await studyMaterial(chart);
  const usable = (anchor: string): boolean =>
    (timeKnown || !anchorNeedsTime(anchor)) && anchorKey(chart, anchor) !== null && materialOf(anchor).length > 0;
  const random = seededRandom(seed);
  const plan = planQuiz(input.length, usable, random);

  const planned = [...plan.items, ...plan.spares];
  const requests: StatementRequest[] = planned.map((item, index) => ({
    id: `q${index}`,
    area: item.area,
    material: materialOf(item.anchor),
  }));
  const valid = new Map<string, string>();
  const keep = (statements: ReadonlyMap<string, string>): void => {
    for (const [id, text] of statements) if (checkStatement(text, input.language).ok) valid.set(id, text);
  };
  const first = await writeStatements(requests, input.language, setup.model, setup.system);
  if (first.status !== "ok") {
    await discard();
    return problem("ai_failed", "message" in first ? first.message : first.status);
  }
  keep(first.statements);
  // One more try for the questions whose statement failed its check (not for the spares).
  const again = requests.slice(0, plan.items.length).filter((r) => !valid.has(r.id));
  if (again.length > 0) {
    const second = await writeStatements(again, input.language, setup.model, setup.system);
    if (second.status === "ok") keep(second.statements);
  }

  // The questions as asked: a failed one gives its place to the next valid spare.
  const spareQueue = plan.spares
    .map((item, index) => ({ item, id: `q${plan.items.length + index}` }))
    .filter((s) => valid.has(s.id));
  const final: { item: PlannedItem; text: string }[] = [];
  plan.items.forEach((item, index) => {
    const own = valid.get(`q${index}`);
    if (own !== undefined) final.push({ item, text: own });
    else {
      const spare = spareQueue.shift();
      if (spare !== undefined) final.push({ item: spare.item, text: valid.get(spare.id) as string });
    }
  });

  const used = new Set<string>();
  const candidatesCache = new Map<string, DecoyCandidate[]>();
  const items: NewItem[] = [];
  for (const { item, text } of final) {
    const key = anchorKey(chart, item.anchor);
    if (key === null) continue;
    const cacheKey = `${item.area}|${item.anchor}`;
    const candidates =
      candidatesCache.get(cacheKey) ??
      (await StudyStore.decoyCandidates(ctx, input.language, item.area, item.anchor, setup.model, setup.version));
    candidatesCache.set(cacheKey, candidates);
    const pair = chooseDecoys(candidates, key, wordCount(text), used, random);
    if (pair === null) continue;
    used.add(pair[0].id);
    used.add(pair[1].id);
    const { options, correct } = arrangeOptions(text, pair, random);
    items.push({ position: items.length, area: item.area, anchor: item.anchor, key, options, correct });
  }
  if (items.length < MIN_QUESTIONS) {
    await discard();
    return problem("not_ready");
  }

  try {
    await StudyStore.completeSession(ctx, sessionId, chart.id, items);
  } catch (error) {
    await discard();
    throw error;
  }
  return { ok: true, value: { sessionId } };
}

/* ------------------------------ during the test ------------------------------ */

export interface StudyQuestionView {
  readonly position: number;
  readonly area: string;
  readonly question: string;
  readonly options: readonly { readonly key: Letter; readonly text: string }[];
}

export interface StudyResultView {
  readonly recognised: number;
  readonly answered: number;
  readonly percent: number;
  /** One in three: what luck alone gives. */
  readonly chancePercent: number;
  readonly items: readonly {
    readonly area: string;
    readonly question: string;
    readonly own: string;
    readonly picked: Letter | null;
    readonly recognised: boolean;
  }[];
  /** The readee link's token; the route turns it into an address. */
  readonly shareToken: string | null;
}

export interface SessionView {
  readonly id: string;
  readonly name: string;
  readonly language: StudyLanguage;
  readonly status: "building" | "ready" | "finished";
  readonly total: number;
  readonly answered: number;
  readonly current: StudyQuestionView | null;
  readonly result: StudyResultView | null;
}

function questionOf(area: string, language: StudyLanguage): string {
  return STUDY_AREAS.find((a) => a.slug === area)?.question[language] ?? area;
}

/** What the participant's browser may see: never a right answer before the test is over. */
export function toView(session: SessionRow, items: readonly ItemRow[]): SessionView {
  const score = scoreAnswers(items);
  const next = items.find((item) => item.answer === null);
  const finished = session.status === "finished";
  return {
    id: session.id,
    name: session.name,
    language: session.language,
    status: session.status,
    total: items.length,
    answered: score.answered,
    current:
      finished || next === undefined
        ? null
        : {
            position: next.position,
            area: next.area,
            question: questionOf(next.area, session.language),
            options: next.options.map((o) => ({ key: o.key, text: o.text })),
          },
    result: finished
      ? {
          recognised: score.recognised,
          answered: score.answered,
          percent: score.percent,
          chancePercent: 33,
          items: items.map((item) => ({
            area: item.area,
            question: questionOf(item.area, session.language),
            own: item.options.find((o) => o.key === item.correct)?.text ?? "",
            picked: item.answer,
            recognised: item.answer === item.correct,
          })),
          shareToken: session.share_token,
        }
      : null,
  };
}

export async function getTest(sessionId: string): Promise<StudyOutcome<SessionView>> {
  const ctx = studyContext();
  if (ctx === null) return problem("not_configured");
  try {
    const loaded = await StudyStore.loadSession(ctx, sessionId);
    if (loaded === null || loaded.session.status === "building") return problem("not_found");
    return { ok: true, value: toView(loaded.session, loaded.items) };
  } catch (error) {
    return problem("storage_failed", error instanceof Error ? error.message : String(error));
  }
}

/**
 * One answer. The last one closes the test: the score is kept, the private link made (password: the
 * birth date), and every reading of the chart queued, so the full chart and its PDF follow.
 */
export async function answerQuestion(sessionId: string, position: number, answer: Letter): Promise<StudyOutcome<SessionView>> {
  const ctx = studyContext();
  if (ctx === null) return problem("not_configured");
  try {
    const loaded = await StudyStore.loadSession(ctx, sessionId);
    if (loaded === null || loaded.session.status === "building") return problem("not_found");
    if (loaded.session.status === "finished") return { ok: true, value: toView(loaded.session, loaded.items) };
    const item = loaded.items.find((i) => i.position === position);
    if (item === undefined) return problem("not_found");
    if (item.answer === null) await StudyStore.saveAnswer(ctx, sessionId, position, answer);

    const items = loaded.items.map((i) => (i.position === position && i.answer === null ? { ...i, answer } : i));
    const score = scoreAnswers(items);
    let session = loaded.session;
    if (score.answered < items.length) {
      await StudyStore.saveProgress(ctx, sessionId, score.answered, score.recognised);
    } else {
      const shareToken = await closeTest(ctx, session);
      await StudyStore.finish(ctx, sessionId, score.answered, score.recognised, shareToken);
      session = { ...session, status: "finished", share_token: shareToken };
    }
    return { ok: true, value: toView({ ...session, answered: score.answered, recognised: score.recognised }, items) };
  } catch (error) {
    return problem("storage_failed", error instanceof Error ? error.message : String(error));
  }
}

/** The private link and the readings. A failure here never takes the score away. */
async function closeTest(ctx: StudyContext, session: SessionRow): Promise<string | null> {
  if (session.chart_id === null) return null;
  const chartId = session.chart_id;
  return runAsUser(ctx.client, ctx.ownerId, async () => {
    let token: string | null = null;
    try {
      const chart = await ChartsStore.getChart(chartId);
      const password = birthDatePassword(chart.birth.date);
      if (password !== null) token = await StudyStore.createShareLink(ctx, chartId, password);
    } catch (error) {
      console.error(`[study] no private link for ${chartId}: ${error instanceof Error ? error.message : String(error)}`);
    }
    try {
      await StudyStore.queueReadings(ctx, chartId, session.language);
    } catch (error) {
      console.error(`[study] readings not queued for ${chartId}: ${error instanceof Error ? error.message : String(error)}`);
    }
    return token;
  });
}

/* ------------------------------ the fake charts ------------------------------ */

export interface PoolStatus {
  readonly target: number;
  readonly fakeCharts: number;
  /** Fake charts whose statements are written, in both languages, with the current prompt and model. */
  readonly ready: number;
  readonly model: string;
  readonly promptVersion: string;
}

async function poolStatus(ctx: StudyContext): Promise<PoolStatus> {
  const setup = await statementSetup();
  const charts = await StudyStore.fakeCharts(ctx);
  const written = await StudyStore.writtenByChart(ctx, setup.model, setup.version);
  const ready = charts.filter((c) => {
    const counts = written.get(c.id);
    return counts !== undefined && counts.en > 0 && counts.fr > 0;
  }).length;
  return { target: FAKE_CHART_TARGET, fakeCharts: charts.length, ready, model: setup.model, promptVersion: setup.version };
}

export async function fakeChartsStatus(ownerId: string): Promise<StudyOutcome<PoolStatus>> {
  const ctx = studyContext();
  if (ctx === null || ctx.ownerId !== ownerId) return problem("not_configured");
  try {
    return { ok: true, value: await runAsUser(ctx.client, ctx.ownerId, () => poolStatus(ctx)) };
  } catch (error) {
    return problem("storage_failed", error instanceof Error ? error.message : String(error));
  }
}

/** Every (area, anchor) a fake chart has material for: its wrong answers cover all of them. */
function allRequests(chart: Chart, materialOf: (anchor: string) => readonly string[]): StatementRequest[] {
  const requests: StatementRequest[] = [];
  for (const area of STUDY_AREAS) {
    for (const anchor of area.anchors) {
      if (anchorKey(chart, anchor) === null) continue;
      const material = materialOf(anchor);
      if (material.length > 0) requests.push({ id: `${area.slug}|${anchor}`, area: area.slug, material });
    }
  }
  return requests;
}

/**
 * One step of preparing the wrong answers, small enough for one request: write a missing language for a
 * fake chart, or make the next fake chart. The Study page calls it until everything is ready.
 */
export async function prepareFakeChartsStep(ownerId: string): Promise<StudyOutcome<PoolStatus & { readonly did: string }>> {
  const ctx = studyContext();
  if (ctx === null || ctx.ownerId !== ownerId) return problem("not_configured");
  try {
    return await runAsUser(ctx.client, ctx.ownerId, async () => {
      const setup = await statementSetup();
      const charts = await StudyStore.fakeCharts(ctx);
      const written = await StudyStore.writtenByChart(ctx, setup.model, setup.version);

      for (const fake of charts) {
        const counts = written.get(fake.id) ?? { en: 0, fr: 0 };
        const language = (["en", "fr"] as const).find((l) => counts[l] === 0);
        if (language === undefined) continue;
        const materialOf = await studyMaterial(fake.chart);
        const requests = allRequests(fake.chart, materialOf);
        const result = await writeStatements(requests, language, setup.model, setup.system);
        if (result.status !== "ok") return problem("ai_failed", "message" in result ? result.message : result.status);
        const decoys = requests.flatMap((request) => {
          const text = result.statements.get(request.id);
          if (text === undefined) return [];
          const check = checkStatement(text, language);
          const [area, anchor] = request.id.split("|") as [string, string];
          const key = anchorKey(fake.chart, anchor);
          return check.ok && key !== null ? [{ language, area, anchor, key, text, words: check.words }] : [];
        });
        await StudyStore.insertDecoys(ctx, fake.id, setup.model, setup.version, decoys);
        const status = await poolStatus(ctx);
        return { ok: true, value: { ...status, did: `wrote ${decoys.length} ${language === "en" ? "English" : "French"} statements` } };
      }

      if (charts.length < FAKE_CHART_TARGET) {
        const birth = fakeBirth(seededRandom(randomUUID()));
        const draft = newChartFromDraft(
          {
            personal: { firstName: "Fake chart", lastName: String(charts.length + 1) },
            dateTime: { birthDate: birth.date, birthTime: birth.time, unknownTime: false },
            location: {
              birthPlace: birth.city.name,
              country: birth.city.country,
              timezone: birth.city.timezone,
              latitude: birth.city.latitude,
              longitude: birth.city.longitude,
              utcOffset: utcOffsetLabel(birth.city.timezone),
            },
            configuration: { houseSystem: "Placidus", language: "en", aiModel: DEFAULT_AI_MODEL },
          },
          `fake-${randomUUID()}`,
        );
        const outcome = await calculateChart(draft);
        if (outcome.status !== "ok") return problem("chart_failed", outcome.status === "failed" ? outcome.message : "not configured");
        await StudyStore.insertFakeChart(ctx, { date: birth.date, time: birth.time, city: birth.city.name, timezone: birth.city.timezone }, outcome.chart);
        const status = await poolStatus(ctx);
        return { ok: true, value: { ...status, did: `made fake chart ${charts.length + 1}` } };
      }

      return { ok: true, value: { ...(await poolStatus(ctx)), did: "nothing left to do" } };
    });
  } catch (error) {
    return problem("storage_failed", error instanceof Error ? error.message : String(error));
  }
}

/* ------------------------------ the owner's side ------------------------------ */

/** The signed-in user is the owner named by STUDY_OWNER_USER_ID. */
export function isStudyOwner(userId: string | null): userId is string {
  const owner = (process.env.STUDY_OWNER_USER_ID ?? "").trim();
  return userId !== null && owner !== "" && userId === owner;
}

export interface Tally {
  readonly label: string;
  readonly answered: number;
  readonly recognised: number;
  readonly percent: number;
}

export interface StudyOverview {
  readonly today: number;
  readonly limit: number;
  readonly pool: PoolStatus;
  readonly totals: { readonly tests: number; readonly finished: number } & Omit<Tally, "label">;
  readonly byArea: readonly Tally[];
  readonly byLength: readonly Tally[];
  readonly byTime: readonly Tally[];
  readonly byLanguage: readonly Tally[];
  readonly sessions: readonly {
    readonly id: string;
    readonly createdAt: string;
    readonly name: string;
    readonly email: string;
    readonly language: StudyLanguage;
    readonly length: StudyLength;
    readonly timeKnown: boolean;
    readonly news: boolean;
    /** "stopped": the server gave up while building it (see isStaleBuild). */
    readonly status: "building" | "stopped" | "ready" | "finished";
    readonly answered: number;
    readonly recognised: number;
    readonly total: number;
    readonly chartId: string | null;
  }[];
}

function tally(label: string, items: readonly ItemRow[]): Tally {
  const score = scoreAnswers(items);
  return { label, answered: score.answered, recognised: score.recognised, percent: score.percent };
}

function groupTally<K extends string>(
  items: readonly ItemRow[],
  keyOf: (item: ItemRow) => K,
  order: readonly K[],
): Tally[] {
  return order.map((key) => tally(key, items.filter((item) => keyOf(item) === key))).filter((t) => t.answered > 0);
}

/** Everything the Study page shows: today, the fake charts, every result, every test. */
export async function studyOverview(now: Date = new Date()): Promise<StudyOutcome<StudyOverview>> {
  const ctx = studyContext();
  if (ctx === null) return problem("not_configured");
  try {
    return await runAsUser(ctx.client, ctx.ownerId, async () => {
      const sessions = await StudyStore.listSessions(ctx, 500);
      const finished = sessions.filter((s) => s.status === "finished");
      const items = await StudyStore.itemsOf(ctx, finished.map((s) => s.id));
      const sessionOf = new Map(finished.map((s) => [s.id, s]));
      const answeredItems = items.filter((i) => sessionOf.has(i.session_id));
      const all = tally("all", answeredItems);
      return {
        ok: true as const,
        value: {
          today: await StudyStore.countSince(ctx, dayStartIn(now, STUDY_TIME_ZONE)),
          limit: DAILY_LIMIT,
          pool: await poolStatus(ctx),
          totals: { tests: sessions.length, finished: finished.length, answered: all.answered, recognised: all.recognised, percent: all.percent },
          byArea: groupTally(answeredItems, (i) => i.area, STUDY_AREAS.map((a) => a.slug)),
          byLength: groupTally(answeredItems, (i) => sessionOf.get(i.session_id)?.length ?? "medium", ["short", "medium", "long"] as const),
          byTime: groupTally(
            answeredItems,
            (i) => (sessionOf.get(i.session_id)?.birth_time_known === true ? "birth time known" : "no birth time"),
            ["birth time known", "no birth time"] as const,
          ),
          byLanguage: groupTally(answeredItems, (i) => sessionOf.get(i.session_id)?.language ?? "en", ["en", "fr"] as const),
          sessions: sessions.map((s) => ({
            id: s.id,
            createdAt: s.created_at,
            name: s.name,
            email: s.email,
            language: s.language,
            length: s.length,
            timeKnown: s.birth_time_known,
            news: s.news_consent_at !== null,
            status: isStaleBuild(s.status, s.created_at, now) ? "stopped" : s.status,
            answered: s.answered,
            recognised: s.recognised,
            total: s.total,
            chartId: s.chart_id,
          })),
        },
      };
    });
  } catch (error) {
    return problem("storage_failed", error instanceof Error ? error.message : String(error));
  }
}

function csvCell(value: string | number | boolean | null): string {
  const text = value === null ? "" : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** One row per question answered, for the owner to keep and to publish from. */
export async function studyCsv(): Promise<StudyOutcome<string>> {
  const ctx = studyContext();
  if (ctx === null) return problem("not_configured");
  try {
    const sessions = (await StudyStore.listSessions(ctx, 5000)).filter((s) => s.status === "finished");
    const items = await StudyStore.itemsOf(ctx, sessions.map((s) => s.id));
    const sessionOf = new Map(sessions.map((s) => [s.id, s]));
    const header = [
      "test", "started", "name", "email", "language", "length", "birth_time_known", "news",
      "question", "area", "anchor", "placement", "answer", "right_answer", "recognised",
    ];
    const lines = [header.join(",")];
    const sorted = [...items].sort((a, b) => a.session_id.localeCompare(b.session_id) || a.position - b.position);
    for (const item of sorted) {
      const s = sessionOf.get(item.session_id);
      if (s === undefined) continue;
      lines.push(
        [
          s.id, s.created_at, s.name, s.email, s.language, s.length, s.birth_time_known, s.news_consent_at !== null,
          item.position + 1, item.area, item.anchor, item.key, item.answer, item.correct, item.answer === item.correct,
        ].map(csvCell).join(","),
      );
    }
    return { ok: true, value: `${lines.join("\n")}\n` };
  } catch (error) {
    return problem("storage_failed", error instanceof Error ? error.message : String(error));
  }
}

/** Someone asks to be forgotten: their chart (with its readings and link) and their test go. */
export async function deleteParticipant(sessionId: string): Promise<StudyOutcome<{ readonly deleted: true }>> {
  const ctx = studyContext();
  if (ctx === null) return problem("not_configured");
  try {
    const loaded = await StudyStore.loadSession(ctx, sessionId);
    if (loaded === null) return problem("not_found");
    const chartId = loaded.session.chart_id;
    if (chartId !== null) await runAsUser(ctx.client, ctx.ownerId, () => ChartsStore.deleteChart(chartId));
    await StudyStore.deleteSession(ctx, sessionId);
    return { ok: true, value: { deleted: true } };
  } catch (error) {
    return problem("storage_failed", error instanceof Error ? error.message : String(error));
  }
}

/** The HTTP status and a plain message for each problem (the test page words them in its language). */
export function problemResponse(p: StudyProblem, detail?: string): { status: number; body: { error: { code: StudyProblem; message: string } } } {
  const table: Record<StudyProblem, [number, string]> = {
    not_configured: [503, "The test isn't set up on this server yet."],
    full_today: [429, `Today's ${DAILY_LIMIT} tests are taken. Come back tomorrow.`],
    already_today: [429, "This email has already taken today's test."],
    under_18: [403, "The test is for adults, 18 and over."],
    place_failed: [422, "That birthplace couldn't be found on the map. Pick it again from the suggestions."],
    chart_failed: [502, "The chart couldn't be calculated. Check the birth details and try again."],
    not_ready: [503, "The test isn't ready yet. Please try again later."],
    ai_failed: [502, "The questions couldn't be written just now. Please try again in a minute."],
    not_found: [404, "This test doesn't exist."],
    storage_failed: [500, "Something went wrong while saving. Please try again."],
  };
  const [status, message] = table[p];
  if (detail !== undefined && status >= 500) console.error(`[study] ${p}: ${detail}`);
  return { status, body: { error: { code: p, message } } };
}

/**
 * The pages allowed to run the test in a visitor's browser: the Astro Study site and its preview on
 * GitHub Pages. STUDY_SITE_ORIGINS (comma-separated) replaces the list, e.g. to add the site's
 * workers.dev address before its domain is set up.
 */
const SITE_ORIGINS = ["https://astrostudy.co.uk", "https://www.astrostudy.co.uk", "https://joanacodes.github.io"];

function siteOrigins(): readonly string[] {
  const set = (process.env.STUDY_SITE_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim().replace(/\/+$/, ""))
    .filter((origin) => origin !== "");
  return set.length > 0 ? set : SITE_ORIGINS;
}

/**
 * Headers for the test's public routes: a page on one of those sites may read the answer. Nothing
 * else crosses over: no cookies are allowed through, so the owner's routes stay out of reach.
 */
export function corsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get("origin");
  if (origin === null || !siteOrigins().includes(origin)) return { vary: "Origin" };
  return {
    vary: "Origin",
    "access-control-allow-origin": origin,
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-headers": "content-type",
    "access-control-max-age": "86400",
  };
}

/** The view as sent to the browser, with the readee link as a full address on the host it was asked on. */
export function withLink(view: SessionView, request: Request): SessionView & { readonly result: (StudyResultView & { readonly link: string | null }) | null } {
  const token = view.result?.shareToken ?? null;
  const link = token === null ? null : `${new URL(request.url).origin}/r/${token}`;
  return { ...view, result: view.result === null ? null : { ...view.result, link } };
}
