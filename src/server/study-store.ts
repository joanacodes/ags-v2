/**
 * The Astro Study test (TASK-0013): its tables (supabase/migrations/202610260007_study.sql).
 *
 * Participants have no account, so every read and write goes through the server's own client (the
 * secret key) on behalf of the owner named by STUDY_OWNER_USER_ID. Nothing here is reachable from a
 * browser except through the study routes, which never hand out a question's right answer before it
 * is answered. Rows coming back from the database are checked before use (ADR-0009).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { READING_DOMAINS } from "@/interpretation/domains";
import {
  isLetter,
  type DecoyCandidate,
  type Letter,
  type ShownOption,
  type StudyLanguage,
  type StudyLength,
} from "@/study/quiz";
import type { Chart } from "@/types";

export class StudyStorageError extends Error {}

export interface StudyContext {
  readonly client: SupabaseClient;
  readonly ownerId: string;
}

/**
 * A test still "building" this long after it started will never finish: the start route gives up after
 * two minutes (maxDuration), so the server stopped half-way. It still counts towards the day (the money
 * may be spent) but no longer stops the same person from trying again.
 */
const STALE_BUILD_MS = 5 * 60_000;

export function isStaleBuild(status: string, createdAt: string, now: Date): boolean {
  return status === "building" && now.getTime() - Date.parse(createdAt) > STALE_BUILD_MS;
}

/** Null when the test can't run here: no secret key, or no owner named. */
export function studyContext(): StudyContext | null {
  const ownerId = (process.env.STUDY_OWNER_USER_ID ?? "").trim();
  const client = createSupabaseServiceClient();
  if (client === null || ownerId === "") return null;
  return { client, ownerId };
}

export interface SessionRow {
  readonly id: string;
  readonly chart_id: string | null;
  readonly share_token: string | null;
  readonly name: string;
  readonly email: string;
  readonly language: StudyLanguage;
  readonly length: StudyLength;
  readonly birth_time_known: boolean;
  readonly news_consent_at: string | null;
  readonly source: string | null;
  readonly status: "building" | "ready" | "finished";
  readonly total: number;
  readonly answered: number;
  readonly recognised: number;
  readonly created_at: string;
  readonly finished_at: string | null;
}

export interface ItemRow {
  readonly session_id: string;
  readonly position: number;
  readonly area: string;
  readonly anchor: string;
  readonly key: string;
  readonly options: readonly ShownOption[];
  readonly correct: Letter;
  readonly answer: Letter | null;
  readonly answered_at: string | null;
}

export interface NewSession {
  readonly name: string;
  readonly email: string;
  readonly language: StudyLanguage;
  readonly length: StudyLength;
  readonly birthTimeKnown: boolean;
  readonly newsConsent: boolean;
  readonly source: string | null;
  readonly seed: string;
  readonly model: string;
  readonly promptVersion: string;
}

export interface NewItem {
  readonly position: number;
  readonly area: string;
  readonly anchor: string;
  readonly key: string;
  readonly options: readonly ShownOption[];
  readonly correct: Letter;
}

export interface NewDecoy {
  readonly language: StudyLanguage;
  readonly area: string;
  readonly anchor: string;
  readonly key: string;
  readonly text: string;
  readonly words: number;
}

const SESSION_COLUMNS =
  "id, chart_id, share_token, name, email, language, length, birth_time_known, news_consent_at, source, status, total, answered, recognised, created_at, finished_at";
const ITEM_COLUMNS = "session_id, position, area, anchor, key, options, correct, answer, answered_at";

function fail(what: string, error: { message: string } | null): never {
  throw new StudyStorageError(`${what}: ${error?.message ?? "no answer from the database"}`);
}

/* ------------------------------ row checking ------------------------------ */

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null) throw new StudyStorageError("Unexpected row from the database.");
  return value as Record<string, unknown>;
}
const str = (r: Record<string, unknown>, k: string): string => {
  const v = r[k];
  if (typeof v !== "string") throw new StudyStorageError(`Unexpected ${k} in a study row.`);
  return v;
};
const strOrNull = (r: Record<string, unknown>, k: string): string | null => (typeof r[k] === "string" ? (r[k] as string) : null);
const num = (r: Record<string, unknown>, k: string): number => {
  const v = r[k];
  if (typeof v !== "number") throw new StudyStorageError(`Unexpected ${k} in a study row.`);
  return v;
};

function toSession(value: unknown): SessionRow {
  const r = record(value);
  const language = str(r, "language");
  const length = str(r, "length");
  const status = str(r, "status");
  if (language !== "en" && language !== "fr") throw new StudyStorageError("Unexpected language in a study row.");
  if (length !== "short" && length !== "medium" && length !== "long") throw new StudyStorageError("Unexpected length in a study row.");
  if (status !== "building" && status !== "ready" && status !== "finished") {
    throw new StudyStorageError("Unexpected status in a study row.");
  }
  return {
    id: str(r, "id"),
    chart_id: strOrNull(r, "chart_id"),
    share_token: strOrNull(r, "share_token"),
    name: str(r, "name"),
    email: str(r, "email"),
    language,
    length,
    birth_time_known: r.birth_time_known === true,
    news_consent_at: strOrNull(r, "news_consent_at"),
    source: strOrNull(r, "source"),
    status,
    total: num(r, "total"),
    answered: num(r, "answered"),
    recognised: num(r, "recognised"),
    created_at: str(r, "created_at"),
    finished_at: strOrNull(r, "finished_at"),
  };
}

function toOptions(value: unknown): ShownOption[] {
  if (!Array.isArray(value) || value.length !== 3) throw new StudyStorageError("Unexpected options in a study row.");
  return value.map((entry) => {
    const r = record(entry);
    const key = r.key;
    const origin = r.origin;
    if (!isLetter(key) || (origin !== "self" && origin !== "decoy")) throw new StudyStorageError("Unexpected option in a study row.");
    return { key, text: str(r, "text"), origin, decoyId: strOrNull(r, "decoyId") };
  });
}

function toItem(value: unknown): ItemRow {
  const r = record(value);
  const correct = r.correct;
  const answer = r.answer;
  if (!isLetter(correct)) throw new StudyStorageError("Unexpected answer key in a study row.");
  return {
    session_id: str(r, "session_id"),
    position: num(r, "position"),
    area: str(r, "area"),
    anchor: str(r, "anchor"),
    key: str(r, "key"),
    options: toOptions(r.options),
    correct,
    answer: isLetter(answer) ? answer : null,
    answered_at: strOrNull(r, "answered_at"),
  };
}

/* --------------------------------- the store --------------------------------- */

export const StudyStore = {
  /** Tests started since a moment (the daily limit). */
  async countSince(ctx: StudyContext, since: Date): Promise<number> {
    const { count, error } = await ctx.client
      .from("study_sessions")
      .select("id", { count: "exact", head: true })
      .eq("owner_id", ctx.ownerId)
      .gte("created_at", since.toISOString());
    if (error !== null) fail("Could not count today's tests", error);
    return count ?? 0;
  },

  /** Tests started with this email since a moment (one a day), stopped builds aside. Emails are stored lower-case. */
  async countEmailSince(ctx: StudyContext, email: string, since: Date, now: Date = new Date()): Promise<number> {
    const { data, error } = await ctx.client
      .from("study_sessions")
      .select("status, created_at")
      .eq("owner_id", ctx.ownerId)
      .eq("email", email.toLowerCase())
      .gte("created_at", since.toISOString());
    if (error !== null) fail("Could not check this email's tests", error);
    return (data ?? []).filter((row) => {
      const r = record(row);
      return !isStaleBuild(str(r, "status"), str(r, "created_at"), now);
    }).length;
  },

  /**
   * A test's place, taken before anything is spent on it (status "building"): the daily limit and the
   * one-a-day check count it from this moment. Released with deleteSession if it's refused or fails.
   */
  async reserveSession(ctx: StudyContext, session: NewSession): Promise<string> {
    const now = new Date().toISOString();
    const { data, error } = await ctx.client
      .from("study_sessions")
      .insert({
        owner_id: ctx.ownerId,
        name: session.name,
        email: session.email.toLowerCase(),
        language: session.language,
        length: session.length,
        birth_time_known: session.birthTimeKnown,
        study_consent_at: now,
        news_consent_at: session.newsConsent ? now : null,
        source: session.source,
        seed: session.seed,
        model: session.model,
        prompt_version: session.promptVersion,
      })
      .select("id")
      .single();
    if (error !== null || data === null) fail("Could not save the test", error);
    return str(record(data), "id");
  },

  /** The built test: its chart, its questions, and ready to take. */
  async completeSession(ctx: StudyContext, id: string, chartId: string, items: readonly NewItem[]): Promise<void> {
    const rows = items.map((item) => ({ session_id: id, ...item, options: item.options }));
    const { error: itemsError } = await ctx.client.from("study_items").insert(rows);
    if (itemsError !== null) fail("Could not save the test's questions", itemsError);
    const { error } = await ctx.client
      .from("study_sessions")
      .update({ chart_id: chartId, total: items.length, status: "ready" })
      .eq("id", id);
    if (error !== null) fail("Could not open the test", error);
  },

  async loadSession(ctx: StudyContext, id: string): Promise<{ session: SessionRow; items: ItemRow[] } | null> {
    const { data, error } = await ctx.client
      .from("study_sessions")
      .select(SESSION_COLUMNS)
      .eq("id", id)
      .eq("owner_id", ctx.ownerId)
      .maybeSingle();
    if (error !== null) fail("Could not open the test", error);
    if (data === null) return null;
    const { data: items, error: itemsError } = await ctx.client
      .from("study_items")
      .select(ITEM_COLUMNS)
      .eq("session_id", id)
      .order("position", { ascending: true });
    if (itemsError !== null) fail("Could not open the test's questions", itemsError);
    return { session: toSession(data), items: (items ?? []).map(toItem) };
  },

  /** An answer, once: a question already answered keeps its first answer. */
  async saveAnswer(ctx: StudyContext, id: string, position: number, answer: Letter): Promise<void> {
    const { error } = await ctx.client
      .from("study_items")
      .update({ answer, answered_at: new Date().toISOString() })
      .eq("session_id", id)
      .eq("position", position)
      .is("answer", null);
    if (error !== null) fail("Could not save the answer", error);
  },

  async saveProgress(ctx: StudyContext, id: string, answered: number, recognised: number): Promise<void> {
    const { error } = await ctx.client.from("study_sessions").update({ answered, recognised }).eq("id", id);
    if (error !== null) fail("Could not save the progress", error);
  },

  async finish(ctx: StudyContext, id: string, answered: number, recognised: number, shareToken: string | null): Promise<void> {
    const { error } = await ctx.client
      .from("study_sessions")
      .update({ status: "finished", answered, recognised, share_token: shareToken, finished_at: new Date().toISOString() })
      .eq("id", id);
    if (error !== null) fail("Could not close the test", error);
  },

  /** The participant's readee link (password: their birth date as DDMMYYYY). */
  async createShareLink(ctx: StudyContext, chartId: string, password: string): Promise<string> {
    const { data, error } = await ctx.client.rpc("create_study_share_link", {
      p_owner: ctx.ownerId,
      p_chart_id: chartId,
      p_password: password,
    });
    if (error !== null) fail("Could not make the private link", error);
    const result = record(data);
    if (result.status !== "ok" || typeof result.token !== "string") {
      throw new StudyStorageError(`Could not make the private link: ${String(result.status)}`);
    }
    return result.token;
  },

  /** Every reading of the chart, queued for the background writer (the full chart everyone gets). */
  async queueReadings(ctx: StudyContext, chartId: string, language: StudyLanguage): Promise<number> {
    const rows = READING_DOMAINS.map((domain, position) => ({
      user_id: ctx.ownerId,
      chart_id: chartId,
      slug: domain.slug,
      position,
      style: "conversational",
      language,
    }));
    const { error } = await ctx.client.from("generation_jobs").insert(rows);
    if (error !== null) fail("Could not queue the readings", error);
    return rows.length;
  },

  /* ------------------------------ wrong answers ------------------------------ */

  /** The fake charts' statements for one question, written by this model and prompt version. */
  async decoyCandidates(
    ctx: StudyContext,
    language: StudyLanguage,
    area: string,
    anchor: string,
    model: string,
    promptVersion: string,
  ): Promise<DecoyCandidate[]> {
    const { data, error } = await ctx.client
      .from("study_decoys")
      .select("id, key, text, words, study_fake_charts!inner(owner_id)")
      .eq("study_fake_charts.owner_id", ctx.ownerId)
      .eq("language", language)
      .eq("area", area)
      .eq("anchor", anchor)
      .eq("model", model)
      .eq("prompt_version", promptVersion);
    if (error !== null) fail("Could not read the wrong answers", error);
    return (data ?? []).map((row: unknown) => {
      const r = record(row);
      return { id: str(r, "id"), key: str(r, "key"), text: str(r, "text"), words: num(r, "words") };
    });
  },

  /** How many usable wrong answers exist in a language for this model and prompt version. */
  async countDecoys(ctx: StudyContext, language: StudyLanguage, model: string, promptVersion: string): Promise<number> {
    const { count, error } = await ctx.client
      .from("study_decoys")
      .select("id, study_fake_charts!inner(owner_id)", { count: "exact", head: true })
      .eq("study_fake_charts.owner_id", ctx.ownerId)
      .eq("language", language)
      .eq("model", model)
      .eq("prompt_version", promptVersion);
    if (error !== null) fail("Could not count the wrong answers", error);
    return count ?? 0;
  },

  async fakeCharts(ctx: StudyContext): Promise<{ id: string; chart: Chart }[]> {
    const { data, error } = await ctx.client
      .from("study_fake_charts")
      .select("id, chart_payload")
      .eq("owner_id", ctx.ownerId)
      .order("created_at", { ascending: true });
    if (error !== null) fail("Could not read the fake charts", error);
    return (data ?? []).map((row: unknown) => {
      const r = record(row);
      return { id: str(r, "id"), chart: record(r.chart_payload) as unknown as Chart };
    });
  },

  /** Per fake chart and language, how many statements this model and prompt version wrote. */
  async writtenByChart(
    ctx: StudyContext,
    model: string,
    promptVersion: string,
  ): Promise<Map<string, Record<StudyLanguage, number>>> {
    const { data, error } = await ctx.client
      .from("study_decoys")
      .select("fake_chart_id, language, study_fake_charts!inner(owner_id)")
      .eq("study_fake_charts.owner_id", ctx.ownerId)
      .eq("model", model)
      .eq("prompt_version", promptVersion);
    if (error !== null) fail("Could not read the wrong answers", error);
    const out = new Map<string, Record<StudyLanguage, number>>();
    for (const row of data ?? []) {
      const r = record(row);
      const id = str(r, "fake_chart_id");
      const language = str(r, "language");
      const counts = out.get(id) ?? { en: 0, fr: 0 };
      if (language === "en" || language === "fr") counts[language] += 1;
      out.set(id, counts);
    }
    return out;
  },

  async insertFakeChart(ctx: StudyContext, birth: Record<string, unknown>, chart: Chart): Promise<string> {
    const { data, error } = await ctx.client
      .from("study_fake_charts")
      .insert({ owner_id: ctx.ownerId, birth, chart_payload: chart })
      .select("id")
      .single();
    if (error !== null || data === null) fail("Could not save the fake chart", error);
    return str(record(data), "id");
  },

  async insertDecoys(
    ctx: StudyContext,
    fakeChartId: string,
    model: string,
    promptVersion: string,
    decoys: readonly NewDecoy[],
  ): Promise<void> {
    if (decoys.length === 0) return;
    const rows = decoys.map((d) => ({ fake_chart_id: fakeChartId, model, prompt_version: promptVersion, ...d }));
    const { error } = await ctx.client.from("study_decoys").insert(rows);
    if (error !== null) fail("Could not save the wrong answers", error);
  },

  /* ------------------------------ the owner's side ------------------------------ */

  async listSessions(ctx: StudyContext, limit: number): Promise<SessionRow[]> {
    const { data, error } = await ctx.client
      .from("study_sessions")
      .select(SESSION_COLUMNS)
      .eq("owner_id", ctx.ownerId)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error !== null) fail("Could not list the tests", error);
    return (data ?? []).map(toSession);
  },

  async itemsOf(ctx: StudyContext, sessionIds: readonly string[]): Promise<ItemRow[]> {
    const out: ItemRow[] = [];
    // In slices: an address with thousands of ids would be too long.
    for (let i = 0; i < sessionIds.length; i += 100) {
      const slice = sessionIds.slice(i, i + 100);
      const { data, error } = await ctx.client.from("study_items").select(ITEM_COLUMNS).in("session_id", slice);
      if (error !== null) fail("Could not read the answers", error);
      out.push(...(data ?? []).map(toItem));
    }
    return out;
  },

  async deleteSession(ctx: StudyContext, id: string): Promise<void> {
    const { error } = await ctx.client.from("study_sessions").delete().eq("id", id).eq("owner_id", ctx.ownerId);
    if (error !== null) fail("Could not delete the test", error);
  },
};
