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

export const READING_ENGINE_VERSION = "reading-engine-1.0";
const MODEL = "claude-sonnet-4-6";

const PLANET_GLYPHS: Readonly<Record<string, string>> = {
  Sun: "☉", Moon: "☽", Mercury: "☿", Venus: "♀", Mars: "♂",
  Jupiter: "♃", Saturn: "♄", Uranus: "♅", Neptune: "♆", Pluto: "♇",
  ASC: "AC", MC: "MC", DC: "DC", IC: "IC",
};
const ASPECT_GLYPHS: Readonly<Record<string, string>> = {
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

/* ----------------------------- AI layer ------------------------------ */

interface AiSection {
  heading: string;
  paragraphs: string[];
  example?: string;
  pullQuote?: string;
}

const TEACHING_SYSTEM_PROMPT = [
  "You are the reading writer of AGS (Astrology Grammar System), writing for a",
  "TOTAL BEGINNER who knows nothing about astrology. You receive composed",
  "sentences produced deterministically from a person's birth chart and a",
  "curated knowledge base. Your job is to turn them into a reading that",
  "TEACHES while it interprets.",
  "",
  "Hard rules:",
  "1. GROUNDING — every claim must trace to a provided sentence. Never mention",
  "   a planet, sign, house, or aspect that is not in the material. Never",
  "   contradict the material.",
  "2. COVERAGE — address EVERY factor listed in the material at least once.",
  "   Do not skip any. If two factors say similar things, connect them",
  "   explicitly rather than dropping one.",
  "3. TEACH THE MECHANICS — when you first use a factor, briefly explain how",
  "   it works in plain words: a planet is a function (what part of the",
  "   person acts), a sign is a style (how it acts), a house is a life area",
  "   (where it acts), an aspect is a relationship between two functions,",
  "   retrograde means the function runs inward-first. One short clause is",
  "   enough — teach as you go, never lecture separately.",
  "4. BE CONCRETE — for each major point, give a precise everyday situation",
  "   the reader can recognize: a conversation at work, a text left on read,",
  "   a family dinner, a budgeting decision. Write 'this can look like…'",
  "   moments, not abstractions.",
  "5. EXPLAIN WHY — always connect the interpretation back to its factor:",
  "   'because Mercury (how you think) sits in… it tends to…'.",
  "6. VOICE — warm, direct, second person ('you'). No mystical filler, no",
  "   hedging every sentence, no robotic lists of traits. Vary sentence",
  "   length. It should read like a sharp, kind teacher talking.",
  "7. NO advice on medical, legal, or financial decisions; no predictions of",
  "   specific events; describe tendencies and patterns, never fate.",
  "",
  "OUTPUT — respond with ONLY a JSON object, no markdown fences, no preamble:",
  '{ "sections": [ { "heading": string, "paragraphs": string[],',
  '   "example"?: string, "pullQuote"?: string } ] }',
  "The FIRST section is mandatory: heading 'At a glance' — one paragraph of",
  "3-4 sentences summarizing the whole reading, the headline picture a reader",
  "gets in twenty seconds. Then write 4 to 6 sections in this arc: (1) what",
  "shapes this area and how the",
  "pieces fit, (2) how it plays out day to day, (3) strengths to lean on,",
  "(4) frictions and growth edges, (5) practical guidance. 2-4 paragraphs",
  "per section. Put the single most relatable everyday scenario of a section",
  "in its 'example' field. Use at most one pullQuote in the whole reading.",
].join("\n");

const STYLE_INSTRUCTIONS: Readonly<Record<string, string>> = {
  clinical:
    "STYLE: clinical — precise, measured, plainly factual. Neutral vocabulary, no lyricism, no rhetorical questions. Still warm enough to read humanely.",
  poetic:
    "STYLE: poetic — imagery and rhythm are welcome, but every image must stay anchored to a factor; never let the language drift from the material.",
  conversational:
    "STYLE: conversational — relaxed, direct, like a knowledgeable friend explaining over coffee. Contractions welcome; precision still mandatory.",
};

function buildUserPrompt(
  personName: string,
  domain: ReadingDomainDefinition,
  groups: readonly ComposedGroup[],
  style: string,
): string {
  const lines: string[] = [];
  lines.push(`Reading domain: ${domain.title}`);
  lines.push(`Subject: ${personName}`);
  lines.push(STYLE_INSTRUCTIONS[style] ?? STYLE_INSTRUCTIONS.clinical);
  if (domain.promptFocus !== undefined) {
    lines.push(`Domain guidance: ${domain.promptFocus}`);
  }
  const labels = groups.flatMap((g) => g.items.map((i) => i.label));
  lines.push("");
  lines.push(
    `COVERAGE CHECKLIST — every one of these ${labels.length} factors must be addressed: ${labels.join("; ")}.`,
  );
  lines.push("");
  lines.push("Source material (cover every line):");
  for (const group of groups) {
    lines.push(`\n## ${group.title}`);
    for (const item of group.items) lines.push(`- ${item.sentence}`);
  }
  return lines.join("\n");
}

type AiResult =
  | { status: "ok"; sections: AiSection[]; model: string }
  | { status: "no_api_key" }
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

async function callReadingAi(
  personName: string,
  domain: ReadingDomainDefinition,
  groups: readonly ComposedGroup[],
  style: string,
): Promise<AiResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (apiKey === undefined || apiKey.length === 0) return { status: "no_api_key" };
  const request = {
    model: MODEL,
    max_tokens: 6000,
    system: TEACHING_SYSTEM_PROMPT,
    messages: [{ role: "user", content: buildUserPrompt(personName, domain, groups, style) }],
  };
  // One retry on invalid JSON — structure corruption is rare but cheap to absorb.
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify(request),
      });
      if (!response.ok) {
        const body = await response.text();
        return {
          status: "provider_error",
          message: `Anthropic API ${response.status}: ${body.slice(0, 300)}`,
        };
      }
      const data = (await response.json()) as {
        content?: ReadonlyArray<{ type: string; text?: string }>;
      };
      const text = (data.content ?? [])
        .map((b) => (b.type === "text" && typeof b.text === "string" ? b.text : ""))
        .join("");
      const sections = parseSections(text);
      if (sections !== null) return { status: "ok", sections, model: MODEL };
    } catch (error) {
      return {
        status: "provider_error",
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }
  return { status: "provider_error", message: "Model returned unparseable reading JSON twice." };
}

/* --------------------------- reading build --------------------------- */

function confidenceFromEvidence(factorCount: number, aspectCount: number) {
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

function toReadingSections(sections: readonly AiSection[]): ReadingSection[] {
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
    "pain-healing", "purpose-growth", "summary",
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
  | { status: "provider_error"; message: string };

/** Generate the full, teaching-voice reading for one domain of one chart. */
export async function generateDomainReading(
  chart: Chart,
  slug: string,
  style: string = "clinical",
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

  const personName = `${chart.person.firstName} ${chart.person.lastName}`.trim();
  const ai = await callReadingAi(personName, domain, groups, style);
  if (ai.status !== "ok") return ai;

  const factors = buildChartFactors(domainMatches);
  const aspects = buildRelevantAspects(domainMatches);

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
