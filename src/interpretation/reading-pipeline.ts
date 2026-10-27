/**
 * Per-domain reading generation (server-side).
 *
 * chart -> grammar matches -> DOMAIN FILTER -> composed sentences
 *       -> teaching-voice AI (structured JSON, validated)
 *       -> full Reading object the existing UI already renders.
 *
 * The AI receives only the composed sentences and must cover every one of
 * them — explanatory, beginner-first, with concrete everyday examples.
 */
import type { GrammarMatch } from "@/grammar/types";
import type {
  ChartFactorUsed,
  Reading,
  ReadingSection,
  RelevantAspect,
  Chart,
} from "@/types";
import { runInterpretationPipeline } from "./pipeline";
import type { ComposedGroup, ComposedSentence } from "./composer";
import { getDomain, type ReadingDomainDefinition } from "./domains";
import {
  anthropicHeaders,
  modelRequestFields,
  readMessagesResponse,
  resolveAiModel,
  type AiModelId,
} from "./ai-models";
import {
  READING_OUTPUT_FORMAT,
  deepPromptKey,
  defaultPrompts,
  styleKey,
  type PromptSet,
} from "./prompts";
import { formatOrb, pointContacts, type PointContact } from "./point-contacts";

export const READING_ENGINE_VERSION = "reading-engine-1.0";

export const PLANET_GLYPHS: Readonly<Record<string, string>> = {
  Sun: "☉", Moon: "☽", Mercury: "☿", Venus: "♀", Mars: "♂",
  Jupiter: "♃", Saturn: "♄", Uranus: "♅", Neptune: "♆", Pluto: "♇",
  Chiron: "⚷", Lilith: "⚸",
  ASC: "AC", MC: "MC", DC: "DC", IC: "IC",
};
export const ASPECT_GLYPHS: Readonly<Record<string, string>> = {
  conjunction: "☌", sextile: "⚹", square: "□", trine: "△", opposition: "☍",
};

/* ------------------------- domain filtering -------------------------- */

function valueOf(match: GrammarMatch, key: string): unknown {
  return match.values[key];
}

/** Does this match belong to the domain? Deterministic, config-driven. */
export function matchBelongsToDomain(
  match: GrammarMatch,
  domain: ReadingDomainDefinition,
): boolean {
  if (domain.wholeChart === true) return true;
  const planets = domain.planets as readonly string[];
  const houses = domain.houses as readonly number[];
  const angles = domain.angles as readonly string[];

  switch (match.structure) {
    case "planet_in_sign":
      return planets.includes(String(valueOf(match, "point")));
    case "planet_in_house": {
      const point = String(valueOf(match, "point"));
      const house = Number(valueOf(match, "house"));
      return planets.includes(point) || houses.includes(house);
    }
    case "house_cusp_in_sign":
      return houses.includes(Number(valueOf(match, "house")));
    case "angle_in_sign":
      return angles.includes(String(valueOf(match, "point")));
    case "point_in_sign":
      return (domain.points ?? []).includes(String(valueOf(match, "point")));
    case "point_in_house": {
      const point = String(valueOf(match, "point"));
      const house = Number(valueOf(match, "house"));
      return (domain.points ?? []).includes(point) || houses.includes(house);
    }
    case "planet_retrograde": {
      const point = String(valueOf(match, "point"));
      return planets.includes(point) || (domain.points ?? []).includes(point);
    }
    case "planet_aspect_planet": {
      const from = String(valueOf(match, "from"));
      const to = String(valueOf(match, "to"));
      return (
        planets.includes(from) ||
        planets.includes(to) ||
        angles.includes(from) ||
        angles.includes(to)
      );
    }
    case "house_ruler_in_house": {
      // A ruler link belongs to a domain through either house it connects;
      // the ruler's own placement is already covered by planet_in_house.
      const house = Number(valueOf(match, "house"));
      const rulerHouse = Number(valueOf(match, "rulerHouse"));
      return houses.includes(house) || houses.includes(rulerHouse);
    }
    case "planet_stationary": {
      const point = String(valueOf(match, "point"));
      return planets.includes(point) || (domain.points ?? []).includes(point);
    }
    default:
      return false;
  }
}

/* --------------------------- evidence build -------------------------- */

function buildChartFactors(matches: readonly GrammarMatch[]): ChartFactorUsed[] {
  const factors: ChartFactorUsed[] = [];
  for (const match of matches) {
    if (match.structure === "planet_in_sign" || match.structure === "angle_in_sign") {
      const point = String(valueOf(match, "point"));
      const sign = String(valueOf(match, "sign"));
      factors.push({
        id: match.id,
        glyph: PLANET_GLYPHS[point] ?? point,
        name: `${point} in ${sign}`,
        position: sign,
        explanation: "Selected by the grammar as structurally relevant to this domain.",
      });
    }
    if (match.structure === "planet_in_house") {
      const point = String(valueOf(match, "point"));
      const house = String(valueOf(match, "house"));
      factors.push({
        id: match.id,
        glyph: PLANET_GLYPHS[point] ?? point,
        name: `${point} in House ${house}`,
        position: `House ${house}`,
        explanation: "House placement anchoring this life area.",
      });
    }
    if (match.structure === "point_in_sign") {
      const point = String(valueOf(match, "point"));
      const sign = String(valueOf(match, "sign"));
      factors.push({
        id: match.id,
        glyph: PLANET_GLYPHS[point] ?? "✦",
        name: `${point} in ${sign}`,
        position: sign,
        explanation: "Derived point selected as structurally relevant to this domain.",
      });
    }
    if (match.structure === "planet_retrograde") {
      const point = String(valueOf(match, "point"));
      factors.push({
        id: match.id,
        glyph: "℞",
        name: `${point} retrograde`,
        position: "Retrograde",
        explanation: "Inward-first expression of this function.",
      });
    }
    if (match.structure === "house_cusp_in_sign") {
      const house = String(valueOf(match, "house"));
      const sign = String(valueOf(match, "sign"));
      factors.push({
        id: match.id,
        glyph: "⌂",
        name: `House ${house} cusp in ${sign}`,
        position: sign,
        explanation: "The sign on this cusp colors how the whole house is approached.",
      });
    }
    if (match.structure === "house_ruler_in_house") {
      const house = String(valueOf(match, "house"));
      const ruler = String(valueOf(match, "ruler"));
      const rulerHouse = String(valueOf(match, "rulerHouse"));
      factors.push({
        id: match.id,
        glyph: PLANET_GLYPHS[ruler] ?? ruler,
        name: `House ${house} ruler ${ruler} in House ${rulerHouse}`,
        position: `House ${rulerHouse}`,
        explanation: "Where the function governing this house actually operates.",
      });
    }
    if (match.structure === "planet_stationary") {
      const point = String(valueOf(match, "point"));
      const direction = String(valueOf(match, "direction"));
      factors.push({
        id: match.id,
        glyph: "S",
        name: `${point} stationary`,
        position: direction === "retrograde" ? "Stationary retrograde" : "Stationary direct",
        explanation: "Standing still at birth: this function is intensified and turns inward.",
      });
    }
  }
  return factors;
}

function buildRelevantAspects(matches: readonly GrammarMatch[]): RelevantAspect[] {
  const aspects: RelevantAspect[] = [];
  for (const match of matches) {
    if (match.structure !== "planet_aspect_planet") continue;
    const from = String(valueOf(match, "from"));
    const to = String(valueOf(match, "to"));
    const type = String(valueOf(match, "type"));
    const orb = String(valueOf(match, "orb") ?? "");
    aspects.push({
      id: match.id,
      glyphs: `${PLANET_GLYPHS[from] ?? from} ${ASPECT_GLYPHS[type] ?? type} ${PLANET_GLYPHS[to] ?? to}`,
      label: `${from} ${type} ${to}`,
      detail: orb !== "" && orb !== "null" ? `Orb ${orb}` : "Major aspect",
    });
  }
  return aspects;
}

function contactAspects(contacts: readonly PointContact[]): RelevantAspect[] {
  return contacts.map((c) => ({
    id: `contact-${c.from}-${c.type}-${c.to}`.toLowerCase(),
    glyphs: `${PLANET_GLYPHS[c.from] ?? c.from} ${ASPECT_GLYPHS[c.type] ?? c.type} ${PLANET_GLYPHS[c.to] ?? c.to}`,
    label: `${c.from} ${c.type} ${c.to}`,
    detail: `Orb ${formatOrb(c.orb)}`,
  }));
}

/* ----------------------------- AI layer ------------------------------ */

/** What a deep reading receives on top of its own material. */
export interface DeepMaterial {
  readonly contacts: readonly PointContact[];
  /** The rest of the chart, for resources and outcomes. */
  readonly supporting: readonly ComposedGroup[];
}

export interface AiSection {
  heading: string;
  paragraphs: string[];
  example?: string;
  pullQuote?: string;
}

export const LANGUAGE_NAMES: Readonly<Record<string, string>> = {
  en: "English", fr: "French", es: "Spanish", pt: "Portuguese", de: "German", it: "Italian",
};

export function buildUserPrompt(
  personName: string,
  domain: ReadingDomainDefinition,
  groups: readonly ComposedGroup[],
  style: string,
  language: string,
  prompts: PromptSet,
  deep: DeepMaterial | null = null,
): string {
  const lines: string[] = [];
  lines.push(`Reading domain: ${domain.title}`);
  lines.push(`Subject: ${personName}`);
  lines.push(prompts[styleKey(style)]);
  const langName = LANGUAGE_NAMES[language] ?? "English";
  lines.push(
    `OUTPUT LANGUAGE: write every heading, paragraph, example, and pull quote in ${langName}. ` +
    "Keep planet, sign, and house names in their conventional form for that language.",
  );
  const deepKey = deepPromptKey(domain.slug);
  if (deep !== null && deepKey !== null) {
    lines.push("", prompts[deepKey], "");
  } else if (domain.promptFocus !== undefined) {
    lines.push(`Domain guidance: ${domain.promptFocus}`);
  }
  const contactLabels = (deep?.contacts ?? []).map((c) => `${c.from} ${c.type} ${c.to}`);
  const labels = [...groups.flatMap((g) => g.items.map((i) => i.label)), ...contactLabels];
  lines.push("");
  lines.push(
    `COVERAGE CHECKLIST — every one of these ${labels.length} factors must be addressed: ${labels.join("; ")}.`,
  );
  lines.push("");
  lines.push(deep !== null ? "FOCUS material (cover every line):" : "Source material (cover every line):");
  for (const group of groups) {
    lines.push(`\n## ${group.title}`);
    for (const item of group.items) lines.push(`- ${item.sentence}`);
  }
  if (deep !== null && deep.contacts.length > 0) {
    const sources = (domain.contactSources ?? ["Chiron", "Lilith"]).join(" and ");
    lines.push(`\n## Contacts with ${sources} (measured from the chart)`);
    for (const c of deep.contacts) {
      lines.push(`- ${c.from} ${c.type} ${c.to} (orb ${formatOrb(c.orb)})`);
    }
  }
  if (deep !== null && deep.supporting.length > 0) {
    lines.push("");
    lines.push(
      "SUPPORTING material — the rest of the chart. Do not summarise it; use it for what " +
        "helps this person and for the results of going through it, naming each factor you use:",
    );
    for (const group of deep.supporting) {
      lines.push(`\n## ${group.title}`);
      for (const item of group.items) lines.push(`- ${item.sentence}`);
    }
  }
  return lines.join("\n");
}

export type AiResult =
  | { status: "ok"; sections: AiSection[]; model: string }
  | { status: "no_api_key" }
  | { status: "refused"; message: string }
  | { status: "provider_error"; message: string };

function parseSections(raw: string): AiSection[] | null {
  const cleaned = raw.replace(/```json|```/g, "").trim();
  try {
    const parsed = JSON.parse(cleaned) as { sections?: unknown };
    if (!Array.isArray(parsed.sections)) return null;
    const sections: AiSection[] = [];
    for (const s of parsed.sections) {
      if (typeof s !== "object" || s === null) return null;
      const sec = s as Record<string, unknown>;
      if (typeof sec.heading !== "string" || !Array.isArray(sec.paragraphs)) return null;
      const paragraphs = sec.paragraphs.filter(
        (p): p is string => typeof p === "string" && p.trim().length > 0,
      );
      if (paragraphs.length === 0) return null;
      sections.push({
        heading: sec.heading,
        paragraphs,
        example: typeof sec.example === "string" ? sec.example : undefined,
        pullQuote: typeof sec.pullQuote === "string" ? sec.pullQuote : undefined,
      });
    }
    return sections.length > 0 ? sections : null;
  } catch {
    return null;
  }
}

/**
 * One AI call that returns reading sections (JSON), shared by the topic
 * readings and the synastry reading. Retries once on unparseable JSON.
 */
export async function requestSections(
  system: string,
  user: string,
  model: AiModelId,
  allowFallback: boolean,
  maxTokens: number,
): Promise<AiResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (apiKey === undefined || apiKey.length === 0) return { status: "no_api_key" };
  const request = {
    ...modelRequestFields(model, allowFallback, maxTokens),
    system,
    messages: [{ role: "user", content: user }],
  };
  // One retry on invalid JSON — structure corruption is rare but cheap to absorb.
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: anthropicHeaders(apiKey, allowFallback),
        body: JSON.stringify(request),
      });
      if (!response.ok) {
        const body = await response.text();
        return {
          status: "provider_error",
          message: `Anthropic API ${response.status}: ${body.slice(0, 300)}`,
        };
      }
      const result = readMessagesResponse(await response.json(), model);
      if (!result.ok) {
        return { status: result.refused ? "refused" : "provider_error", message: result.message };
      }
      const sections = parseSections(result.text);
      if (sections !== null) return { status: "ok", sections, model: result.model };
    } catch (error) {
      return {
        status: "provider_error",
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }
  return { status: "provider_error", message: "Model returned unparseable reading JSON twice." };
}

async function callReadingAi(
  personName: string,
  domain: ReadingDomainDefinition,
  groups: readonly ComposedGroup[],
  style: string,
  language: string,
  model: AiModelId,
  prompts: PromptSet,
  allowFallback: boolean,
  deep: DeepMaterial | null = null,
): Promise<AiResult> {
  return requestSections(
    `${prompts["reading.system"]}\n\n${READING_OUTPUT_FORMAT}`,
    buildUserPrompt(personName, domain, groups, style, language, prompts, deep),
    model,
    allowFallback,
    // Deep readings are two to three times longer: give them room.
    deep !== null ? 32000 : 16000,
  );
}

/* --------------------------- reading build --------------------------- */

export function confidenceFromEvidence(factorCount: number, aspectCount: number) {
  const evidence = factorCount + aspectCount;
  const stars = evidence >= 9 ? 5 : evidence >= 7 ? 4 : evidence >= 4 ? 3 : evidence >= 2 ? 2 : 1;
  const label =
    stars >= 5 ? "Very High Confidence"
    : stars >= 4 ? "High Confidence"
    : stars >= 3 ? "Moderate Confidence"
    : "Limited Evidence";
  return {
    stars,
    label,
    chartFactorsUsed: factorCount,
    aspectsCorroborating: aspectCount,
    evidenceScore: Math.min(100, 40 + evidence * 6),
  };
}

export function toReadingSections(sections: readonly AiSection[]): ReadingSection[] {
  return sections.map((s, index) => ({
    id: `section-${index + 1}`,
    heading: s.heading,
    paragraphs: s.paragraphs,
    pullQuote: s.pullQuote,
    keyInsight:
      s.example !== undefined
        ? { eyebrow: "In practice, this can look like", body: s.example }
        : undefined,
  }));
}

function suggestedNextFor(slug: string): string[] {
  const order = [
    "personality", "communication", "love-relationships", "career",
    "family", "friends-social", "money-resources", "talents",
    "pain-healing", "blockages-patterns", "purpose-growth", "summary",
  ];
  const index = order.indexOf(slug);
  const next: string[] = [];
  for (let i = 1; next.length < 3 && i <= order.length; i += 1) {
    const candidate = order[(index + i) % order.length];
    if (candidate !== slug) next.push(candidate);
  }
  return next;
}

export type GeneratedReadingOutcome =
  | { status: "ok"; reading: Reading }
  | { status: "no_api_key" }
  | { status: "no_placements" }
  | { status: "refused"; message: string }
  | { status: "provider_error"; message: string };

export interface ReadingGenerationOptions {
  /** The user's prompts (defaults when omitted). */
  readonly prompts?: PromptSet;
  readonly allowFallback?: boolean;
}

/** Generate the full, teaching-voice reading for one domain of one chart. */
export async function generateDomainReading(
  chart: Chart,
  slug: string,
  style: string = "conversational",
  language: string = "en",
  options: ReadingGenerationOptions = {},
): Promise<GeneratedReadingOutcome> {
  const domain = getDomain(slug);
  if (domain === undefined) return { status: "provider_error", message: `Unknown domain "${slug}".` };
  if (chart.planets.length === 0) return { status: "no_placements" };

  const pipeline = await runInterpretationPipeline(chart);
  const domainMatches = pipeline.matches.filter((m) => matchBelongsToDomain(m, domain));
  const matchIds = new Set(domainMatches.map((m) => m.id));
  const groups = pipeline.groups
    .map((g) => ({ ...g, items: g.items.filter((i: ComposedSentence) => matchIds.has(i.matchId)) }))
    .filter((g) => g.items.length > 0);

  const deep: DeepMaterial | null =
    domain.deep === true
      ? {
          contacts: pointContacts(chart, domain.contactSources ?? []),
          supporting: pipeline.groups
            .map((g) => ({ ...g, items: g.items.filter((i: ComposedSentence) => !matchIds.has(i.matchId)) }))
            .filter((g) => g.items.length > 0),
        }
      : null;

  const personName = `${chart.person.firstName} ${chart.person.lastName}`.trim();
  const model = resolveAiModel(chart.configuration.aiModel);
  const ai = await callReadingAi(
    personName,
    domain,
    groups,
    style,
    language,
    model,
    options.prompts ?? defaultPrompts(),
    options.allowFallback ?? false,
    deep,
  );
  if (ai.status !== "ok") return ai;

  const factors = buildChartFactors(domainMatches);
  const aspects = [...buildRelevantAspects(domainMatches), ...contactAspects(deep?.contacts ?? [])];

  const reading: Reading = {
    id: `reading-${chart.id}-${slug}`,
    chartId: chart.id,
    slug,
    title: domain.title,
    shortTitle: domain.shortTitle,
    icon: domain.icon,
    description: domain.description,
    estimatedMinutes: domain.estimatedMinutes,
    status: "complete",
    progress: 100,
    breadcrumb: ["Birth Chart", "Readings", domain.title],
    confidence: confidenceFromEvidence(factors.length, aspects.length),
    chartFactors: factors,
    relevantAspects: aspects,
    sections: toReadingSections(ai.sections),
    suggestedNext: suggestedNextFor(slug),
  };
  return { status: "ok", reading };
}

/** An empty scaffold shown before a domain has been generated. */
export function scaffoldReading(chart: Chart, domain: ReadingDomainDefinition): Reading {
  return {
    id: `reading-${chart.id}-${domain.slug}`,
    chartId: chart.id,
    slug: domain.slug,
    title: domain.title,
    shortTitle: domain.shortTitle,
    icon: domain.icon,
    description: domain.description,
    estimatedMinutes: domain.estimatedMinutes,
    status: "not-started",
    progress: 0,
    breadcrumb: ["Birth Chart", "Readings", domain.title],
    confidence: {
      stars: 0,
      label: "Not generated yet",
      chartFactorsUsed: 0,
      aspectsCorroborating: 0,
      evidenceScore: 0,
    },
    chartFactors: [],
    relevantAspects: [],
    sections: [],
    suggestedNext: suggestedNextFor(domain.slug),
  };
}
