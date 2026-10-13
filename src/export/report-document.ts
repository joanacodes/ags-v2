/**
 * The report as a real document, independent of any file format.
 *
 * `buildReportDocument` turns a chart + its report into headings,
 * paragraphs (with bold/italic runs) and tables; the renderers turn that
 * into PDF, DOCX, Markdown or plain text. Only the readee's reading goes in:
 * no AI model, no engine/generator labels, no astrologer notes.
 */
import { formatBirthMoment } from "../lib/format";
import type { Chart, Reading, Report } from "../types";

export interface Run {
  text: string;
  bold?: boolean;
  italic?: boolean;
}

export type Block =
  | { type: "heading"; level: 1 | 2 | 3; text: string; pageBreakBefore?: boolean }
  | { type: "paragraph"; runs: Run[] }
  | { type: "quote"; runs: Run[] }
  | { type: "definitions"; items: { term: string; definition: string }[] }
  | { type: "table"; title: string; rows: [string, string][] };

export interface ExportDocument {
  title: string;
  /** Lines under the title: birth moment, place. */
  subtitle: string[];
  /** Big Three on the cover. */
  highlights: { label: string; value: string }[];
  blocks: Block[];
  /** Safe file name without extension. */
  fileBase: string;
  /** PNG data URL of the chart wheel, added by the browser before rendering. */
  wheelImage?: string;
  /** What the document is, shown on the cover; "Birth chart reading" when absent. */
  kindLabel?: string;
}

export interface ExportOptions {
  technicalAppendix: boolean;
}

/** Split `**bold**`, `_italic_` and `==highlight==` markers into runs. */
export function parseRuns(text: string): Run[] {
  const pattern = /(\*\*.+?\*\*|==.+?==|_[^_\s][^_]*_)/g;
  const runs: Run[] = [];
  for (const part of text.split(pattern)) {
    if (part.length === 0) continue;
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      runs.push({ text: part.slice(2, -2), bold: true });
    } else if (part.startsWith("==") && part.endsWith("==") && part.length > 4) {
      runs.push({ text: part.slice(2, -2) });
    } else if (part.startsWith("_") && part.endsWith("_") && part.length > 2) {
      runs.push({ text: part.slice(1, -1), italic: true });
    } else {
      runs.push({ text: part });
    }
  }
  return runs;
}

function placement(p: { degree: number; sign: string } | undefined): string | null {
  return p === undefined ? null : `${p.degree}° ${p.sign}`;
}

export function buildReportDocument(chart: Chart, report: Report, options: ExportOptions): ExportDocument {
  const name = `${chart.person.firstName} ${chart.person.lastName}`.trim();
  const subtitle = [formatBirthMoment(chart.birth.date, chart.birth.time), chart.birth.place].filter(
    (line) => line.length > 0,
  );

  const highlights: { label: string; value: string }[] = [];
  const sun = placement(chart.planets.find((p) => p.planet === "Sun"));
  const moon = placement(chart.planets.find((p) => p.planet === "Moon"));
  const asc = placement(chart.angles.find((a) => a.point === "ASC"));
  if (sun !== null) highlights.push({ label: "Sun", value: sun });
  if (moon !== null) highlights.push({ label: "Moon", value: moon });
  if (asc !== null) highlights.push({ label: "Ascendant", value: asc });

  const blocks: Block[] = [];
  const ready = report.sections.filter((s) => s.status !== "locked" && (s.paragraphs?.length ?? 0) > 0);

  if (ready.length > 0) {
    blocks.push({ type: "heading", level: 2, text: "Contents", pageBreakBefore: true });
    for (const [i, section] of ready.entries()) {
      blocks.push({ type: "paragraph", runs: [{ text: `${i + 1}. ${section.title}` }] });
    }
  }

  for (const [i, section] of ready.entries()) {
    blocks.push({ type: "heading", level: 2, text: `${i + 1}. ${section.title}`, pageBreakBefore: true });
    for (const paragraph of section.paragraphs ?? []) {
      const text = paragraph.trim();
      if (text.length === 0) continue;
      if (text.startsWith("## ")) blocks.push({ type: "heading", level: 3, text: text.slice(3).trim() });
      else blocks.push({ type: "paragraph", runs: parseRuns(text) });
    }
    if (section.pullQuote !== undefined && section.pullQuote.trim().length > 0) {
      blocks.push({ type: "quote", runs: parseRuns(section.pullQuote.trim()) });
    }
  }

  if (report.glossary.length > 0) {
    blocks.push({ type: "heading", level: 2, text: "Glossary", pageBreakBefore: true });
    blocks.push({ type: "definitions", items: report.glossary });
  }

  if (options.technicalAppendix) {
    blocks.push({ type: "heading", level: 2, text: "Chart data", pageBreakBefore: true });
    blocks.push({
      type: "table",
      title: "Planetary positions",
      rows: report.appendix.planetaryPositions.map((row) => [row.body, row.position]),
    });
    blocks.push({
      type: "table",
      title: "House cusps",
      rows: report.appendix.houseCusps.map((row) => [row.label, row.position]),
    });
  }

  const fileBase = fileSlug(`${name || "birth-chart"}-reading`, "birth-chart-reading");

  return { title: name || "Birth chart reading", subtitle, highlights, blocks, fileBase };
}

/** "Clara & Marc's reading" -> "clara-marc-s-reading" (safe file name). */
function fileSlug(text: string, fallback: string): string {
  return (
    text
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || fallback
  );
}

export interface SynastryPersonSummary {
  name: string;
  birthLine: string;
  sun?: string;
  moon?: string;
  asc?: string;
}

/** A synastry reading as a document: both people, then the reading. */
export function buildSynastryDocument(
  people: readonly [SynastryPersonSummary, SynastryPersonSummary],
  reading: Pick<Reading, "sections">,
): ExportDocument {
  const [a, b] = people;
  const placements = (p: SynastryPersonSummary) =>
    [p.sun && `Sun ${p.sun}`, p.moon && `Moon ${p.moon}`, p.asc && `Rising ${p.asc}`].filter(Boolean).join(" · ");
  const blocks: Block[] = [];
  for (const section of reading.sections ?? []) {
    blocks.push({ type: "heading", level: 2, text: String(section.heading ?? "") });
    for (const paragraph of section.paragraphs ?? []) {
      const text = String(paragraph ?? "").trim();
      if (text.length > 0) blocks.push({ type: "paragraph", runs: parseRuns(text) });
    }
    if (section.pullQuote !== undefined && section.pullQuote.trim().length > 0) {
      blocks.push({ type: "quote", runs: parseRuns(section.pullQuote.trim()) });
    }
  }
  return {
    title: `${a.name} & ${b.name}`,
    subtitle: ["Synastry: compatibility reading", ...people.map((p) => `${p.name}: ${p.birthLine}`)],
    highlights: people.map((p) => ({ label: p.name, value: placements(p) || p.birthLine })),
    blocks,
    fileBase: fileSlug(`${a.name}-${b.name}-synastry`, "synastry"),
    kindLabel: "Synastry",
  };
}

/**
 * The readee's own copy: their chart summary and the readings shared with
 * them, in the same document layout as the astrologer's report.
 */
export function buildReadingsDocument(
  chart: Pick<Chart, "person" | "birth" | "planets" | "angles">,
  readings: readonly Pick<Reading, "slug" | "title" | "sections">[],
): ExportDocument {
  const report: Report = {
    chartId: "",
    generator: "",
    sectionsReady: readings.length,
    sectionsTotal: readings.length,
    estimatedPages: "",
    format: "",
    sections: readings.map((reading, index) => ({
      id: `section-${reading.slug}`,
      index: index + 1,
      title: reading.title,
      icon: "",
      status: "complete",
      paragraphs: (reading.sections ?? []).flatMap((section) => [
        `## ${section.heading}`,
        ...(section.paragraphs ?? []),
      ]),
      pullQuote: (reading.sections ?? []).find((section) => section.pullQuote !== undefined)?.pullQuote,
    })),
    appendix: { planetaryPositions: [], houseCusps: [] },
    glossary: [],
  };
  return buildReportDocument(chart as Chart, report, { technicalAppendix: false });
}

function runsToMarkdown(runs: readonly Run[]): string {
  return runs
    .map((run) => (run.bold ? `**${run.text}**` : run.italic ? `_${run.text}_` : run.text))
    .join("");
}

function runsToText(runs: readonly Run[]): string {
  return runs.map((run) => run.text).join("");
}

export function toMarkdown(doc: ExportDocument): string {
  const out: string[] = [`# ${doc.title}`, "", ...doc.subtitle.map((line) => `${line}  `), ""];
  if (doc.highlights.length > 0) {
    out.push(doc.highlights.map((h) => `**${h.label}** ${h.value}`).join(" · "), "");
  }
  for (const block of doc.blocks) {
    switch (block.type) {
      case "heading":
        out.push(`${"#".repeat(block.level)} ${block.text}`, "");
        break;
      case "paragraph":
        out.push(runsToMarkdown(block.runs), "");
        break;
      case "quote":
        out.push(`> ${runsToMarkdown(block.runs)}`, "");
        break;
      case "definitions":
        for (const item of block.items) out.push(`- **${item.term}**: ${item.definition}`);
        out.push("");
        break;
      case "table":
        out.push(`**${block.title}**`, "", "| | |", "|---|---|");
        for (const [a, b] of block.rows) out.push(`| ${a} | ${b} |`);
        out.push("");
        break;
    }
  }
  return `${out.join("\n").trim()}\n`;
}

export function toPlainText(doc: ExportDocument): string {
  const rule = (text: string, char: string) => char.repeat(Math.min(72, Math.max(3, text.length)));
  const out: string[] = [doc.title.toUpperCase(), rule(doc.title, "="), ...doc.subtitle, ""];
  if (doc.highlights.length > 0) {
    out.push(doc.highlights.map((h) => `${h.label}: ${h.value}`).join("   "), "");
  }
  for (const block of doc.blocks) {
    switch (block.type) {
      case "heading":
        if (block.level === 2) out.push("", block.text.toUpperCase(), rule(block.text, "-"), "");
        else out.push(block.text, "");
        break;
      case "paragraph":
        out.push(runsToText(block.runs), "");
        break;
      case "quote":
        out.push(`    “${runsToText(block.runs)}”`, "");
        break;
      case "definitions":
        for (const item of block.items) out.push(`${item.term}: ${item.definition}`);
        out.push("");
        break;
      case "table":
        out.push(block.title);
        for (const [a, b] of block.rows) out.push(`  ${a.padEnd(18)} ${b}`);
        out.push("");
        break;
    }
  }
  return `${out.join("\n").trim()}\n`;
}
