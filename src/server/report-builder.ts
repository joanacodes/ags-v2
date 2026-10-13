/**
 * Live report assembly (TASK-0009): builds the full Report for any chart
 * from its calculated data and its generated domain readings. Domains that
 * have not been generated yet appear as locked sections — generating the
 * reading unlocks them.
 */
import { READING_DOMAINS, reportOrder } from "@/interpretation/domains";
import { createCoreKnowledgeRegistry } from "@/knowledge/pack-loader";
import type { KnowledgeRegistry } from "@/knowledge/registry";
import type { Chart, Reading, Report, ReportSection, TechnicalAppendix } from "@/types";

const PLANET_GLYPHS: Readonly<Record<string, string>> = {
  Sun: "☉", Moon: "☽", Mercury: "☿", Venus: "♀", Mars: "♂",
  Jupiter: "♃", Saturn: "♄", Uranus: "♅", Neptune: "♆", Pluto: "♇",
};

function ordinalLabel(n: number): string {
  const rem10 = n % 10;
  const rem100 = n % 100;
  const suffix =
    rem10 === 1 && rem100 !== 11 ? "st"
    : rem10 === 2 && rem100 !== 12 ? "nd"
    : rem10 === 3 && rem100 !== 13 ? "rd"
    : "th";
  return `${n}${suffix} House`;
}

function position(degree: number, minute: number, sign: string): string {
  return `${degree}°${String(minute).padStart(2, "0")}' ${sign}`;
}

function buildAppendix(chart: Chart): TechnicalAppendix {
  return {
    planetaryPositions: chart.planets.map((p) => ({
      glyph: PLANET_GLYPHS[p.planet] ?? p.planet,
      body: p.planet + (p.retrograde === true ? " ℞" : ""),
      position:
        position(p.degree, p.minute, p.sign) +
        (p.house >= 1 ? ` · House ${p.house}` : ""),
    })),
    houseCusps: chart.houses.map((h) => ({
      label: ordinalLabel(h.number),
      position: position(h.degree, h.minute, h.sign),
    })),
  };
}

function sectionFromReading(
  index: number,
  domainTitle: string,
  icon: string,
  slug: string,
  reading: Reading | undefined,
): ReportSection {
  if (reading === undefined || reading.status !== "complete" || reading.sections.length === 0) {
    return { id: `section-${slug}`, index, title: domainTitle, icon, status: "locked", readingSlug: slug };
  }
  const paragraphs = reading.sections.flatMap((s) => [`## ${s.heading}`, ...s.paragraphs]);
  const pullQuote = reading.sections.find((s) => s.pullQuote !== undefined)?.pullQuote;
  return {
    id: `section-${slug}`,
    index,
    title: domainTitle,
    icon,
    status: "complete",
    paragraphs,
    pullQuote,
    readingSlug: slug,
  };
}

export type ReportEdits = Readonly<Record<string, readonly string[]>>;

function glossaryDefinition(registry: KnowledgeRegistry, key: string): string | undefined {
  const resolution = registry.resolve(key);
  if (resolution.status !== "resolved") return undefined;
  const identity = resolution.record.modules.identity;
  if (typeof identity !== "object" || identity === null || Array.isArray(identity)) return undefined;
  const fn = (identity as Record<string, unknown>).canonicalFunction;
  if (typeof fn === "string" && fn.length > 0) return fn.charAt(0).toUpperCase() + fn.slice(1) + ".";
  const domains = (identity as Record<string, unknown>).coreDomains;
  if (Array.isArray(domains) && domains.length > 0) {
    return `Carries the domains of ${domains.slice(0, 3).join(", ").replace(/_/g, " ")}.`;
  }
  return undefined;
}

function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "_");
}

/** Glossary of every term this chart actually uses, from the knowledge base. */
export function buildGlossaryForChart(chart: Chart): { term: string; definition: string }[] {
  const registry = createCoreKnowledgeRegistry();
  const entries: { term: string; definition: string }[] = [];
  const seen = new Set<string>();
  const push = (term: string, key: string) => {
    if (seen.has(key)) return;
    seen.add(key);
    const definition = glossaryDefinition(registry, key);
    if (definition !== undefined) entries.push({ term, definition });
  };
  for (const p of chart.planets) push(p.planet, `planets/${slugify(p.planet)}`);
  for (const p of chart.planets) push(p.sign, `signs/${slugify(p.sign)}`);
  for (const h of chart.houses) push(`House ${h.number}`, `houses/house_${h.number}`);
  for (const a of chart.angles) {
    const names: Record<string, [string, string]> = {
      ASC: ["Ascendant (ASC)", "angles/ascendant"],
      MC: ["Midheaven (MC)", "angles/midheaven"],
      DC: ["Descendant (DC)", "angles/descendant"],
      IC: ["Imum Coeli (IC)", "angles/imum_coeli"],
    };
    const hit = names[a.point];
    if (hit) push(hit[0], hit[1]);
  }
  for (const p of chart.points ?? []) {
    const keys: Record<string, string> = {
      Chiron: "points/chiron", Lilith: "points/lilith",
      "North Node": "points/north_node", "South Node": "points/south_node",
      Vertex: "angles/vertex",
    };
    if (keys[p.point]) push(p.point, keys[p.point]);
  }
  const aspectTypes = new Set(chart.aspects.map((a) => a.type));
  for (const type of aspectTypes) push(type.charAt(0).toUpperCase() + type.slice(1), `aspects/${type}`);
  if (chart.planets.some((p) => p.retrograde) || (chart.points ?? []).some((p) => p.retrograde)) {
    push("Retrograde (℞)", "conditions/retrograde");
  }
  return entries;
}

/** Assemble the report from the chart and its (possibly partial) readings. */
export function buildReport(
  chart: Chart,
  readings: readonly Reading[],
  edits: ReportEdits = {},
): Report {
  const bySlug = new Map(readings.map((r) => [r.slug, r]));
  // Summary opens the report; the other domains follow in canonical order.
  const ordered = [...READING_DOMAINS].sort((a, b) => reportOrder(a.slug) - reportOrder(b.slug));
  const sections = ordered.map((domain, index) =>
    sectionFromReading(index + 1, domain.title, domain.icon, domain.slug, bySlug.get(domain.slug)),
  );
  for (const section of sections) {
    const edited = edits[section.id];
    if (edited !== undefined && section.status === "complete") {
      section.paragraphs = [...edited];
    }
  }
  const ready = sections.filter((s) => s.status === "complete").length;
  const paragraphCount = sections.reduce((n, s) => n + (s.paragraphs?.length ?? 0), 0);
  return {
    chartId: chart.id,
    generator: "Generated by AGS Grammar Engine · FreeAstroAPI ephemeris",
    sectionsReady: ready,
    sectionsTotal: sections.length,
    estimatedPages: `~${Math.max(4, 4 + paragraphCount)} pages`,
    format: "A4 · Print / PDF",
    sections,
    appendix: buildAppendix(chart),
    glossary: buildGlossaryForChart(chart),
  };
}
