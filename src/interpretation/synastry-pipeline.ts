/**
 * Synastry reading generation (server-side).
 *
 * two charts -> contacts + house overlays (deterministic, knowledge-grounded)
 *            + each person's own love placements (natal pipeline)
 *            -> teaching-voice AI (same JSON sections as the topic readings)
 *            -> a SynastryReading stored under the pair's first chart.
 */
import type { Chart, ChartFactorUsed, RelevantAspect, SynastryReading } from "@/types";
import { createCoreKnowledgeRegistry } from "@/knowledge/pack-loader";
import type { ComposedGroup } from "./composer";
import { runInterpretationPipeline } from "./pipeline";
import { resolveAiModel } from "./ai-models";
import {
  READING_OUTPUT_FORMAT,
  defaultPrompts,
  fillPlaceholders,
  styleKey,
  type PromptSet,
} from "./prompts";
import {
  ASPECT_GLYPHS,
  LANGUAGE_NAMES,
  PLANET_GLYPHS,
  confidenceFromEvidence,
  requestSections,
  toReadingSections,
  type GeneratedReadingOutcome,
} from "./reading-pipeline";
import {
  composeSynastry,
  contactLabel,
  displayBody,
  overlayLabel,
  synastryOverview,
  synastrySlug,
  type SynastryOverview,
} from "./synastry";
import { formatOrb } from "./point-contacts";

/** First names, or full names when both people share a first name. */
export function pairNames(owner: Chart, partner: Chart): [string, string] {
  const first = (c: Chart) => c.person.firstName.trim() || "Person";
  const full = (c: Chart) => `${c.person.firstName} ${c.person.lastName}`.trim() || "Person";
  return first(owner) === first(partner) ? [full(owner), full(partner)] : [first(owner), first(partner)];
}

/** Each person's own placements for love and closeness, from their natal material. */
function loveMaterial(groups: readonly ComposedGroup[]): string[] {
  const wanted = [
    /^(Sun|Moon|Mercury|Venus|Mars|ASC|DC|Chiron|Lilith) in [A-Z][a-z]+$/,
    /^(Moon|Venus|Mars) in House \d+$/,
  ];
  return groups.flatMap((g) => g.items.filter((i) => wanted.some((re) => re.test(i.label))).map((i) => i.sentence));
}

function buildUserPrompt(
  names: [string, string],
  overview: SynastryOverview,
  focus: readonly ComposedGroup[],
  supporting: Record<string, readonly string[]>,
  style: string,
  language: string,
  prompts: PromptSet,
): string {
  const [a, b] = names;
  const lines: string[] = [];
  lines.push("Reading: Synastry (relationship compatibility)");
  lines.push(`People: ${a} and ${b}`);
  lines.push(prompts[styleKey(style)]);
  lines.push(
    `OUTPUT LANGUAGE: write every heading, paragraph, example, and pull quote in ${LANGUAGE_NAMES[language] ?? "English"}. ` +
      "Keep planet, sign, and house names in their conventional form for that language.",
  );
  lines.push("", fillPlaceholders(prompts["synastry.reading"], { personA: a, personB: b }), "");
  if (!overview.aTimeKnown) lines.push(`${a}'s birth time is unknown: ${a}'s houses and Ascendant can't be read.`);
  if (!overview.bTimeKnown) lines.push(`${b}'s birth time is unknown: ${b}'s houses and Ascendant can't be read.`);
  const labels = focus.flatMap((g) => g.items.map((i) => i.label));
  lines.push("");
  lines.push(`COVERAGE CHECKLIST — every one of these ${labels.length} factors must be addressed: ${labels.join("; ")}.`);
  lines.push("", "FOCUS material (cover every line):");
  for (const group of focus) {
    lines.push(`\n## ${group.title}`);
    for (const item of group.items) lines.push(`- ${item.sentence}`);
  }
  lines.push(
    "",
    "SUPPORTING material — each person's own chart. Do not summarise it; use it to describe how each one loves, " +
      "desires and feels safe, naming the factor each time:",
  );
  for (const [name, sentences] of Object.entries(supporting)) {
    if (sentences.length === 0) continue;
    lines.push(`\n## ${name}`);
    for (const sentence of sentences) lines.push(`- ${sentence}`);
  }
  return lines.join("\n");
}

function relevantAspects(names: [string, string], overview: SynastryOverview): RelevantAspect[] {
  return overview.contacts.map((c, index) => ({
    id: `syn-aspect-${index}`,
    glyphs: `${PLANET_GLYPHS[c.a] ?? c.a} ${ASPECT_GLYPHS[c.type] ?? c.type} ${PLANET_GLYPHS[c.b] ?? c.b}`,
    label: contactLabel(names[0], names[1], c),
    detail: `Orb ${formatOrb(c.orb)}`,
  }));
}

function overlayFactors(names: [string, string], overview: SynastryOverview): ChartFactorUsed[] {
  const [a, b] = names;
  const make = (owner: string, other: string, list: SynastryOverview["aInB"], id: string) =>
    list.map((o, index) => ({
      id: `syn-${id}-${index}`,
      glyph: PLANET_GLYPHS[o.point] ?? "✦",
      name: overlayLabel(owner, other, o),
      position: `House ${o.house}`,
      explanation: `${owner}'s ${displayBody(o.point)} lights up this area of ${other}'s life.`,
    }));
  return [...make(a, b, overview.aInB, "a"), ...make(b, a, overview.bInA, "b")];
}

function shell(owner: Chart, partner: Chart, names: [string, string]): SynastryReading {
  return {
    kind: "synastry",
    id: `synastry-${owner.id}-${partner.id}`,
    chartId: owner.id,
    slug: synastrySlug(partner.id),
    title: `${names[0]} & ${names[1]}`,
    shortTitle: "Synastry",
    icon: "heart",
    description: "How the two charts interact: attraction, friction, and what helps the relationship.",
    estimatedMinutes: 30,
    status: "in-progress",
    progress: 0,
    breadcrumb: ["Synastry", `${names[0]} & ${names[1]}`],
    confidence: { stars: 0, label: "Not written yet", chartFactorsUsed: 0, aspectsCorroborating: 0, evidenceScore: 0 },
    chartFactors: [],
    relevantAspects: [],
    sections: [],
    suggestedNext: [],
    ownerChartId: owner.id,
    partnerChartId: partner.id,
    ownerName: `${owner.person.firstName} ${owner.person.lastName}`.trim(),
    partnerName: `${partner.person.firstName} ${partner.person.lastName}`.trim(),
  };
}

/** The stored record before the reading is written (lets the job runner find the pair). */
export function pendingSynastry(owner: Chart, partner: Chart): SynastryReading {
  return shell(owner, partner, pairNames(owner, partner));
}

export interface SynastryOptions {
  readonly prompts?: PromptSet;
  readonly allowFallback?: boolean;
}

export type GeneratedSynastryOutcome =
  | { status: "ok"; reading: SynastryReading }
  | Exclude<GeneratedReadingOutcome, { status: "ok" }>;

/** Write the compatibility reading for two charts. */
export async function generateSynastryReading(
  owner: Chart,
  partner: Chart,
  style: string = "conversational",
  language: string = "en",
  options: SynastryOptions = {},
): Promise<GeneratedSynastryOutcome> {
  if (owner.planets.length === 0 || partner.planets.length === 0) return { status: "no_placements" };
  const names = pairNames(owner, partner);
  const overview = synastryOverview(owner, partner);
  const focus = composeSynastry(names[0], names[1], overview, createCoreKnowledgeRegistry());
  const [natalA, natalB] = await Promise.all([runInterpretationPipeline(owner), runInterpretationPipeline(partner)]);
  const prompts = options.prompts ?? defaultPrompts();
  const user = buildUserPrompt(
    names,
    overview,
    focus,
    { [names[0]]: loveMaterial(natalA.groups), [names[1]]: loveMaterial(natalB.groups) },
    style,
    language,
    prompts,
  );
  const ai = await requestSections(
    `${prompts["reading.system"]}\n\n${READING_OUTPUT_FORMAT}`,
    user,
    resolveAiModel(owner.configuration.aiModel),
    options.allowFallback ?? false,
    32000,
  );
  if (ai.status !== "ok") return ai;

  const aspects = relevantAspects(names, overview);
  const factors = overlayFactors(names, overview);
  return {
    status: "ok",
    reading: {
      ...shell(owner, partner, names),
      status: "complete",
      progress: 100,
      confidence: confidenceFromEvidence(factors.length, aspects.length),
      chartFactors: factors,
      relevantAspects: aspects,
      sections: toReadingSections(ai.sections),
    },
  };
}
