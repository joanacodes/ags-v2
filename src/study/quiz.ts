/**
 * The Astro Study test (TASK-0013), the pure part: which questions a quiz asks, which two wrong answers
 * stand beside each right one, whether a written statement may be shown, and the score.
 *
 * Deterministic: everything random is drawn from the session's seed, so a quiz can be rebuilt and
 * audited, and every function here is tested without I/O. The meaning of a statement never comes from
 * here: it is written from the knowledge base by the reading pipeline (src/interpretation/study-statements.ts).
 */
import areasJson from "./areas.json";
import termsJson from "./banned-terms.json";
import citiesJson from "./cities.json";
import type { Chart } from "../types";

export const STUDY_LANGUAGES = ["en", "fr"] as const;
export type StudyLanguage = (typeof STUDY_LANGUAGES)[number];
export const STUDY_LENGTHS = ["short", "medium", "long"] as const;
export type StudyLength = (typeof STUDY_LENGTHS)[number];

export interface StudyArea {
  readonly slug: string;
  readonly anchors: readonly string[];
  readonly question: Readonly<Record<StudyLanguage, string>>;
}

export const STUDY_AREAS: readonly StudyArea[] = areasJson.areas;
export const QUESTIONS_PER_LENGTH: Readonly<Record<StudyLength, number>> = areasJson.lengths;

/** The number of fake charts the wrong answers come from: the architect's number. */
export const FAKE_CHART_TARGET = 30;

/** A statement shown in the test is between these word counts (checked after writing). */
export const STATEMENT_WORDS = { min: 12, max: 36 } as const;

/* ------------------------------ seeded chance ------------------------------ */

/** FNV-1a, 32 bits: a stable number from a text (seeds, prompt versions). */
export function hashString(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** A repeatable sequence of numbers in [0, 1) from a seed (mulberry32). */
export function seededRandom(seed: string): () => number {
  let state = hashString(seed);
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A shuffled copy (Fisher–Yates), the input left untouched. */
export function shuffled<T>(items: readonly T[], random: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    const swap = out[i] as T;
    out[i] = out[j] as T;
    out[j] = swap;
  }
  return out;
}

/**
 * Which version of the statement prompt wrote a statement. Wrong answers are only drawn from statements
 * written by the same prompt and model as the participant's own, so their style can't give them away.
 */
export function promptVersion(promptText: string): string {
  return hashString(promptText).toString(16).padStart(8, "0");
}

/* --------------------------------- anchors --------------------------------- */

const ANGLES: ReadonlySet<string> = new Set(["ASC", "MC", "DC", "IC"]);

/** H1 to H12 → 1 to 12; anything else → null. */
export function houseOfAnchor(anchor: string): number | null {
  const match = /^H(1[0-2]|[1-9])$/.exec(anchor);
  return match === null ? null : Number(match[1]);
}

/** Angles and houses move with the hour: without a birth time they can't be used. */
export function anchorNeedsTime(anchor: string): boolean {
  return ANGLES.has(anchor) || houseOfAnchor(anchor) !== null;
}

/**
 * What a statement about this anchor is mostly about, as "Venus:Libra" or "H7:Aries": a wrong answer
 * with the participant's own key could fit them too, so it is never used beside theirs. Null when the
 * chart doesn't have the anchor.
 */
export function anchorKey(chart: Chart, anchor: string): string | null {
  const house = houseOfAnchor(anchor);
  if (house !== null) {
    const cusp = chart.houses.find((h) => h.number === house);
    return cusp === undefined ? null : `${anchor}:${cusp.sign}`;
  }
  if (ANGLES.has(anchor)) {
    const angle = chart.angles.find((a) => a.point === anchor);
    return angle === undefined ? null : `${anchor}:${angle.sign}`;
  }
  const planet = chart.planets.find((p) => p.planet === anchor);
  if (planet !== undefined) return `${anchor}:${planet.sign}`;
  const point = (chart.points ?? []).find((p) => p.point === anchor);
  return point === undefined ? null : `${anchor}:${point.sign}`;
}

/* ------------------------------- quiz plan -------------------------------- */

export interface PlannedItem {
  readonly area: string;
  readonly anchor: string;
}

export interface QuizPlan {
  /** In the order they are asked. */
  readonly items: readonly PlannedItem[];
  /** Two more, standing by for a statement that fails its check. */
  readonly spares: readonly PlannedItem[];
}

/**
 * The questions of one quiz. `usable(anchor)` says whether the chart has the anchor, has material for
 * it, and (without a birth time) whether it can be used at all. Short: five areas; medium: all ten;
 * long: all ten, twice (each area's two first usable anchors). No anchor is asked twice in a quiz,
 * because two areas reading the same placement would ask the same question twice.
 */
export function planQuiz(
  length: StudyLength,
  usable: (anchor: string) => boolean,
  random: () => number,
  areas: readonly StudyArea[] = STUDY_AREAS,
): QuizPlan {
  const wanted = QUESTIONS_PER_LENGTH[length];
  const perArea = length === "long" ? 2 : 1;
  const order = shuffled(areas, random);
  const used = new Set<string>();
  const take = (area: StudyArea, count: number): PlannedItem[] => {
    const out: PlannedItem[] = [];
    for (const anchor of area.anchors) {
      if (out.length >= count) break;
      if (used.has(anchor) || !usable(anchor)) continue;
      used.add(anchor);
      out.push({ area: area.slug, anchor });
    }
    return out;
  };

  const chosen: PlannedItem[] = [];
  const asked = new Set<string>();
  for (const area of order) {
    if (chosen.length >= wanted) break;
    const items = take(area, Math.min(perArea, wanted - chosen.length));
    if (items.length > 0) asked.add(area.slug);
    chosen.push(...items);
  }
  // Spares come from areas not asked yet first, so a replacement doesn't repeat an area.
  const spareOrder = [...order.filter((a) => !asked.has(a.slug)), ...order.filter((a) => asked.has(a.slug))];
  const spares: PlannedItem[] = [];
  for (const area of spareOrder) {
    if (spares.length >= 2) break;
    spares.push(...take(area, 1));
  }
  return { items: shuffled(chosen, random), spares };
}

/* -------------------------------- statements -------------------------------- */

export function wordCount(text: string): number {
  const trimmed = text.trim();
  return trimmed === "" ? 0 : trimmed.split(/\s+/).length;
}

export interface BannedTerms {
  readonly properNouns: Readonly<Record<StudyLanguage, readonly string[]>>;
  readonly patterns: Readonly<Record<StudyLanguage, readonly string[]>>;
}

export const BANNED_TERMS: BannedTerms = { properNouns: termsJson.properNouns, patterns: termsJson.patterns };

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export type StatementCheck =
  | { readonly ok: true; readonly words: number }
  | { readonly ok: false; readonly reason: "too_short" | "too_long" | "astrology_term"; readonly detail: string };

/**
 * May this statement be shown? Within the word range, and naming nothing astrological: a name would let
 * anyone who knows their chart pick their own without recognising themselves.
 */
export function checkStatement(text: string, language: StudyLanguage, terms: BannedTerms = BANNED_TERMS): StatementCheck {
  const words = wordCount(text);
  if (words < STATEMENT_WORDS.min) return { ok: false, reason: "too_short", detail: `${words} words` };
  if (words > STATEMENT_WORDS.max) return { ok: false, reason: "too_long", detail: `${words} words` };
  for (const noun of terms.properNouns[language]) {
    const pattern = new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRegExp(noun)}(?=$|[^\\p{L}\\p{N}])`, "u");
    if (pattern.test(text)) return { ok: false, reason: "astrology_term", detail: noun };
  }
  for (const source of terms.patterns[language]) {
    if (new RegExp(source, "iu").test(text)) return { ok: false, reason: "astrology_term", detail: source };
  }
  return { ok: true, words };
}

/* ------------------------------- wrong answers ------------------------------- */

export interface DecoyCandidate {
  readonly id: string;
  /** The fake chart's key for the same anchor (see anchorKey). */
  readonly key: string;
  readonly text: string;
  readonly words: number;
}

/**
 * Two wrong answers for one question, from the fake charts' statements for the same area and anchor:
 * never one with the participant's own key, never one already used in this quiz, preferably within a
 * quarter of the right answer's length (so length gives nothing away), and preferably about two
 * different placements. When nothing is close in length, the closest stand in. Null when fewer than two
 * candidates are left.
 */
export function chooseDecoys(
  candidates: readonly DecoyCandidate[],
  ownKey: string,
  ownWords: number,
  alreadyUsed: ReadonlySet<string>,
  random: () => number,
): readonly [DecoyCandidate, DecoyCandidate] | null {
  const eligible = [...candidates]
    .filter((c) => c.key !== ownKey && !alreadyUsed.has(c.id))
    .sort((a, b) => a.id.localeCompare(b.id));
  if (eligible.length < 2) return null;
  const tolerance = Math.max(2, ownWords * 0.25);
  const near = (c: DecoyCandidate): boolean => Math.abs(c.words - ownWords) <= tolerance;
  const closest = (pool: readonly DecoyCandidate[]): DecoyCandidate => {
    let best = pool[0] as DecoyCandidate;
    for (const c of pool) if (Math.abs(c.words - ownWords) < Math.abs(best.words - ownWords)) best = c;
    return best;
  };
  const pick = (pool: readonly DecoyCandidate[]): DecoyCandidate => {
    const close = pool.filter(near);
    if (close.length === 0) return closest(pool);
    return close[Math.floor(random() * close.length)] as DecoyCandidate;
  };

  const first = pick(eligible);
  const rest = eligible.filter((c) => c.id !== first.id);
  const otherPlacement = rest.filter((c) => c.key !== first.key);
  const second = pick(otherPlacement.length > 0 ? otherPlacement : rest);
  return [first, second];
}

export const LETTERS = ["A", "B", "C"] as const;
export type Letter = (typeof LETTERS)[number];

export function isLetter(value: unknown): value is Letter {
  return typeof value === "string" && (LETTERS as readonly string[]).includes(value);
}

export interface ShownOption {
  readonly key: Letter;
  readonly text: string;
  readonly origin: "self" | "decoy";
  readonly decoyId: string | null;
}

/** The three statements in a random order, and which letter is the participant's own. */
export function arrangeOptions(
  own: string,
  decoys: readonly [DecoyCandidate, DecoyCandidate],
  random: () => number,
): { readonly options: readonly ShownOption[]; readonly correct: Letter } {
  const entries = shuffled(
    [
      { text: own, origin: "self" as const, decoyId: null },
      { text: decoys[0].text, origin: "decoy" as const, decoyId: decoys[0].id },
      { text: decoys[1].text, origin: "decoy" as const, decoyId: decoys[1].id },
    ],
    random,
  );
  const options = entries.map((entry, index) => ({ key: LETTERS[index] as Letter, ...entry }));
  let correct: Letter = "A";
  for (const option of options) if (option.origin === "self") correct = option.key;
  return { options, correct };
}

/* ---------------------------------- score ---------------------------------- */

export interface Score {
  readonly answered: number;
  readonly recognised: number;
  /** Recognised out of answered, rounded; 0 before any answer. */
  readonly percent: number;
}

export function scoreAnswers(items: readonly { readonly answer: Letter | null; readonly correct: Letter }[]): Score {
  let answered = 0;
  let recognised = 0;
  for (const item of items) {
    if (item.answer === null) continue;
    answered += 1;
    if (item.answer === item.correct) recognised += 1;
  }
  return { answered, recognised, percent: answered === 0 ? 0 : Math.round((recognised / answered) * 100) };
}

/* --------------------------------- the day --------------------------------- */

function zoneParts(at: Date, timeZone: string): Record<string, number> {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(at);
  const out: Record<string, number> = {};
  for (const part of parts) if (part.type !== "literal") out[part.type] = Number(part.value);
  return out;
}

/** The calendar day it is in that time zone, as YYYY-MM-DD. */
export function dayIn(at: Date, timeZone: string): string {
  const p = zoneParts(at, timeZone);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

/**
 * When the current day began in that time zone (the daily limit counts from there). Europe's clock
 * changes happen at night, never at midnight, so midnight always exists once.
 */
export function dayStartIn(at: Date, timeZone: string): Date {
  const p = zoneParts(at, timeZone);
  const guess = Date.UTC(p.year ?? 1970, (p.month ?? 1) - 1, p.day ?? 1);
  const g = zoneParts(new Date(guess), timeZone);
  const offset = Date.UTC(g.year ?? 1970, (g.month ?? 1) - 1, g.day ?? 1, g.hour ?? 0, g.minute ?? 0, g.second ?? 0) - guess;
  return new Date(guess - offset);
}

/** 18 or over on that day, birthdays counted by the calendar. False for anything that isn't a date. */
export function isAdultOn(birthDate: string, day: string): boolean {
  const born = /^(\d{4})-(\d{2})-(\d{2})$/.exec(birthDate);
  const today = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (born === null || today === null) return false;
  const eighteenth = (Number(born[1]) + 18) * 10000 + Number(born[2]) * 100 + Number(born[3]);
  const now = Number(today[1]) * 10000 + Number(today[2]) * 100 + Number(today[3]);
  return eighteenth <= now;
}

/* -------------------------------- fake charts -------------------------------- */

export interface StudyCity {
  readonly name: string;
  readonly country: string;
  readonly timezone: string;
  readonly latitude: number;
  readonly longitude: number;
}

export const STUDY_CITIES: readonly StudyCity[] = citiesJson.cities;

export interface FakeBirth {
  readonly date: string;
  readonly time: string;
  readonly city: StudyCity;
}

/**
 * Birth details for one fake chart: a date from 1950 to 2007, any minute of the day, a city from the
 * list. Plausible people, not real ones.
 */
export function fakeBirth(random: () => number, cities: readonly StudyCity[] = STUDY_CITIES): FakeBirth {
  const start = Date.UTC(1950, 0, 1);
  const end = Date.UTC(2007, 11, 31);
  const day = new Date(start + Math.floor(random() * ((end - start) / 86400000 + 1)) * 86400000);
  const minutes = Math.floor(random() * 1440);
  const city = cities[Math.floor(random() * cities.length)] as StudyCity;
  return {
    date: day.toISOString().slice(0, 10),
    time: `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`,
    city,
  };
}
