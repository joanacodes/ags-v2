import assert from "node:assert/strict";
import { test } from "node:test";
import { buildReportDocument, parseRuns, toMarkdown, toPlainText, buildSynastryDocument } from "../report-document";
import type { Chart, Report } from "../../types";

const chart = {
  id: "c1",
  person: { id: "p", firstName: "Zoé", lastName: "Martin" },
  birth: { date: "1990-03-14", time: "08:30", place: "Lyon, France" },
  configuration: { houseSystem: "Placidus", zodiac: "Tropical", ephemeris: "Swiss", aiModel: "claude-fable-5-1" },
  planets: [
    { planet: "Sun", degree: 23, minute: 4, sign: "Pisces", house: 12 },
    { planet: "Moon", degree: 2, minute: 10, sign: "Leo", house: 5 },
  ],
  angles: [{ point: "ASC", degree: 11, minute: 0, sign: "Aries" }],
  houses: [],
  aspects: [],
} as unknown as Chart;

const report = {
  chartId: "c1",
  generator: "AGS reading-engine-1.0 · claude-fable-5-1",
  sectionsReady: 1,
  sectionsTotal: 2,
  estimatedPages: "4",
  format: "A4",
  sections: [
    {
      id: "s-career",
      index: 1,
      title: "Career",
      icon: "briefcase",
      status: "complete",
      paragraphs: ["## At a glance", "You build slowly.", "**You are in a meeting when your idea lands.**"],
      pullQuote: "Steady wins.",
    },
    { id: "s-love", index: 2, title: "Love", icon: "heart", status: "locked" },
  ],
  appendix: { planetaryPositions: [{ glyph: "☉", body: "Sun ℞", position: "23°04' Pisces" }], houseCusps: [] },
  glossary: [{ term: "Sun", definition: "Core identity." }],
} as unknown as Report;

test("bold and italic markers become runs", () => {
  assert.deepEqual(parseRuns("A **story** and _aside_ and ==mark=="), [
    { text: "A " },
    { text: "story", bold: true },
    { text: " and " },
    { text: "aside", italic: true },
    { text: " and " },
    { text: "mark" },
  ]);
});

test("the document holds the readings, not the technical details", () => {
  const doc = buildReportDocument(chart, report, { technicalAppendix: false });
  const md = toMarkdown(doc);
  assert.match(md, /^# Zoé Martin/);
  assert.match(md, /## 1\. Career/);
  assert.match(md, /### At a glance/);
  assert.match(md, /\*\*You are in a meeting when your idea lands\.\*\*/);
  assert.match(md, /> Steady wins\./);
  assert.match(md, /\*\*Sun\*\* 23° Pisces/);
  assert.ok(!md.includes("Love"), "locked sections are left out");
  assert.ok(!md.includes("claude"), "no AI model");
  assert.ok(!md.includes("reading-engine"), "no generator label");
  assert.ok(!md.includes("Chart data"), "appendix only when asked");
  assert.equal(doc.fileBase, "zoe-martin-reading");
});

test("plain text has no markup; the appendix appears when enabled", () => {
  const doc = buildReportDocument(chart, report, { technicalAppendix: true });
  const txt = toPlainText(doc);
  assert.ok(!txt.includes("**"));
  assert.match(txt, /You are in a meeting when your idea lands\./);
  assert.match(txt, /CHART DATA/);
  assert.match(txt, /23°04' Pisces/);
});

test("a synastry becomes a document with both people and the reading", () => {
  const doc = buildSynastryDocument(
    [
      { name: "Clara Mercer", birthLine: "12 October 1994 · London", sun: "Libra", moon: "Capricorn", asc: "Aquarius" },
      { name: "Marc Élie", birthLine: "3 May 1992 · Lyon", sun: "Taurus" },
    ],
    {
      sections: [
        { id: "s1", heading: "At a glance", paragraphs: ["You two **build slowly**."] },
        { id: "s2", heading: "The spark", paragraphs: ["Venus meets Mars.", "  "] },
      ],
    },
  );
  assert.equal(doc.title, "Clara Mercer & Marc Élie");
  assert.equal(doc.fileBase, "clara-mercer-marc-elie-synastry");
  assert.equal(doc.kindLabel, "Synastry");
  assert.deepEqual(doc.highlights, [
    { label: "Clara Mercer", value: "Sun Libra · Moon Capricorn · Rising Aquarius" },
    { label: "Marc Élie", value: "Sun Taurus" },
  ]);
  assert.deepEqual(
    doc.blocks.map((b) => b.type),
    ["heading", "paragraph", "heading", "paragraph"],
  );
  assert.deepEqual((doc.blocks[1] as { runs: unknown[] }).runs, [{ text: "You two " }, { text: "build slowly", bold: true }, { text: "." }]);
});
