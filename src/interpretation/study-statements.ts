/**
 * The Astro Study test (TASK-0013): what a test statement is written from, and the AI call that writes
 * them. Server-side.
 *
 * A statement is written from the same composed sentences the readings use (grammar + knowledge base),
 * narrowed to one anchor of the chart: the placement itself, its house when the birth time is known,
 * and its two closest aspects, so the statement is about what that combination does. The AI turns the
 * material into one plain sentence and, as in every AGS reading (TASK-0005), may add no meaning that
 * isn't in it. Participants' statements and the fake charts' statements go through this same code, the
 * same prompt and the same model: that is what keeps the test fair.
 */
import type { GrammarMatch } from "@/grammar/types";
import type { Chart } from "@/types";
import { runInterpretationPipeline } from "./pipeline";
import type { ComposedSentence } from "./composer";
import { anthropicHeaders, modelRequestFields, readMessagesResponse, type AiModelId } from "./ai-models";
import { getDomain } from "./domains";
import { LANGUAGE_NAMES } from "./reading-pipeline";
import { houseOfAnchor, type StudyLanguage } from "../study/quiz";

const ANGLE_POINTS: ReadonlySet<string> = new Set(["ASC", "MC", "DC", "IC"]);

/** "2°34'" → 154 (minutes of arc); anything unreadable sorts last. */
export function orbMinutes(orb: unknown): number {
  if (typeof orb !== "string") return Number.POSITIVE_INFINITY;
  const match = /(\d+)\s*°\s*(\d+)?/.exec(orb);
  return match === null ? Number.POSITIVE_INFINITY : Number(match[1]) * 60 + Number(match[2] ?? 0);
}

/**
 * The composed sentences one anchor's statement is written from, in a stable order: its sign (or a
 * house's cusp sign), its house or the house's occupants when the time is known, retrograde motion, then
 * its two tightest aspects. Without a birth time, nothing that depends on the hour is used.
 */
export function materialForAnchor(
  matches: readonly GrammarMatch[],
  sentences: ReadonlyMap<string, ComposedSentence>,
  anchor: string,
  timeKnown: boolean,
): string[] {
  const house = houseOfAnchor(anchor);
  const picked: GrammarMatch[] = [];
  const aspects: GrammarMatch[] = [];
  for (const match of matches) {
    const v = match.values;
    switch (match.structure) {
      case "planet_in_sign":
      case "point_in_sign":
      case "angle_in_sign":
        if (house === null && v.point === anchor) picked.push(match);
        break;
      case "planet_retrograde":
        if (house === null && v.point === anchor) picked.push(match);
        break;
      case "planet_in_house":
      case "point_in_house":
        if (!timeKnown) break;
        if (house !== null ? Number(v.house) === house : v.point === anchor) picked.push(match);
        break;
      case "house_cusp_in_sign":
        if (timeKnown && house !== null && Number(v.house) === house) picked.push(match);
        break;
      case "planet_aspect_planet":
        if (house !== null || (v.from !== anchor && v.to !== anchor)) break;
        if (!timeKnown && (ANGLE_POINTS.has(String(v.from)) || ANGLE_POINTS.has(String(v.to)))) break;
        aspects.push(match);
        break;
      default:
        break;
    }
  }
  aspects.sort((a, b) => orbMinutes(a.values.orb) - orbMinutes(b.values.orb) || a.id.localeCompare(b.id));
  const out: string[] = [];
  for (const match of [...picked, ...aspects.slice(0, 2)]) {
    const sentence = sentences.get(match.id)?.sentence;
    if (typeof sentence === "string" && sentence.trim() !== "") out.push(sentence.trim());
  }
  return out;
}

/** One chart's material, anchor by anchor (the pipeline runs once per chart). */
export async function studyMaterial(chart: Chart): Promise<(anchor: string) => readonly string[]> {
  const pipeline = await runInterpretationPipeline(chart);
  const sentences = new Map<string, ComposedSentence>();
  for (const group of pipeline.groups) for (const item of group.items) sentences.set(item.matchId, item);
  const cache = new Map<string, readonly string[]>();
  return (anchor: string) => {
    const known = cache.get(anchor);
    if (known !== undefined) return known;
    const material = materialForAnchor(pipeline.matches, sentences, anchor, chart.birth.timeKnown);
    cache.set(anchor, material);
    return material;
  };
}

/* --------------------------------- AI call --------------------------------- */

export interface StatementRequest {
  readonly id: string;
  readonly area: string;
  readonly material: readonly string[];
}

export type StatementsResult =
  | { readonly status: "ok"; readonly statements: ReadonlyMap<string, string>; readonly model: string }
  | { readonly status: "no_api_key" }
  | { readonly status: "refused"; readonly message: string }
  | { readonly status: "provider_error"; readonly message: string };

/** Appended after the editable prompt, read-only: changing it would break how the answer is read. */
export const STUDY_OUTPUT_FORMAT = [
  "OUTPUT — respond with ONLY a JSON object, no markdown fences, no preamble:",
  '{ "statements": [ { "id": string, "text": string } ] }',
  "One entry per item, with the item's id.",
].join("\n");

export function buildStatementsPrompt(requests: readonly StatementRequest[], language: StudyLanguage): string {
  const lines: string[] = [`OUTPUT LANGUAGE: write every statement in ${LANGUAGE_NAMES[language] ?? "English"}.`, ""];
  for (const request of requests) {
    lines.push(`## Item ${request.id} — area of life: ${getDomain(request.area)?.title ?? request.area}`);
    for (const sentence of request.material) lines.push(`- ${sentence}`);
    lines.push("");
  }
  return lines.join("\n");
}

/** The model's answer as id → statement; null when it isn't the expected JSON. */
export function parseStatements(raw: string): Map<string, string> | null {
  const cleaned = raw.replace(/```json|```/g, "").trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const list = (parsed as { statements?: unknown }).statements;
  if (!Array.isArray(list)) return null;
  const out = new Map<string, string>();
  for (const entry of list) {
    if (typeof entry !== "object" || entry === null) return null;
    const { id, text } = entry as { id?: unknown; text?: unknown };
    if (typeof id !== "string" || typeof text !== "string") return null;
    if (text.trim() !== "") out.set(id, text.trim());
  }
  return out;
}

/**
 * One call writes every statement of a quiz (or of one fake chart). Retries once on an unreadable answer.
 */
export async function writeStatements(
  requests: readonly StatementRequest[],
  language: StudyLanguage,
  model: AiModelId,
  systemPrompt: string,
): Promise<StatementsResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (apiKey === undefined || apiKey.length === 0) return { status: "no_api_key" };
  const request = {
    ...modelRequestFields(model, false, 8000),
    system: `${systemPrompt}\n\n${STUDY_OUTPUT_FORMAT}`,
    messages: [{ role: "user", content: buildStatementsPrompt(requests, language) }],
  };
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: anthropicHeaders(apiKey, false),
        body: JSON.stringify(request),
      });
      if (!response.ok) {
        const body = await response.text();
        return { status: "provider_error", message: `Anthropic API ${response.status}: ${body.slice(0, 300)}` };
      }
      const result = readMessagesResponse(await response.json(), model);
      if (!result.ok) return { status: result.refused ? "refused" : "provider_error", message: result.message };
      const statements = parseStatements(result.text);
      if (statements !== null) return { status: "ok", statements, model: result.model };
    } catch (error) {
      return { status: "provider_error", message: error instanceof Error ? error.message : String(error) };
    }
  }
  return { status: "provider_error", message: "The model returned unreadable statements twice." };
}
