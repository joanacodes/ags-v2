import assert from "node:assert/strict";
import { test } from "node:test";
import { READING_DOMAINS, getDomain, reportOrder } from "../domains";
import { matchBelongsToDomain, scaffoldReading } from "../reading-pipeline";
import type { GrammarMatch } from "../../grammar/types";
import type { Chart } from "../../types";

function match(structure: string, values: Record<string, string | number>): GrammarMatch {
  return {
    id: `m-${structure}-${JSON.stringify(values)}`,
    ruleId: "r",
    structure,
    values,
    sourceFactIds: ["f"],
  };
}

test("all 12 domains exist with unique slugs", () => {
  assert.equal(READING_DOMAINS.length, 12);
  assert.equal(new Set(READING_DOMAINS.map((d) => d.slug)).size, 12);
  assert.ok(getDomain("communication"));
});

test("blockages domain takes rulers linked to houses 3/4/8/12 and stationary planets in scope", () => {
  const blockages = getDomain("blockages-patterns");
  assert.ok(blockages);
  assert.equal(blockages.deep, true);
  assert.deepEqual(blockages.contactSources, ["Chiron", "Lilith", "South Node"]);
  assert.equal(blockages.recap, true);
  assert.deepEqual(READING_DOMAINS.filter((d) => d.recap === true).map((d) => d.slug), ["blockages-patterns"]);
  assert.equal(matchBelongsToDomain(match("house_ruler_in_house", { house: 3, ruler: "Sun", rulerHouse: 5 }), blockages), true);
  assert.equal(matchBelongsToDomain(match("house_ruler_in_house", { house: 7, ruler: "Jupiter", rulerHouse: 12 }), blockages), true);
  assert.equal(matchBelongsToDomain(match("house_ruler_in_house", { house: 5, ruler: "Venus", rulerHouse: 6 }), blockages), false);
  assert.equal(matchBelongsToDomain(match("planet_stationary", { point: "Mercury", direction: "retrograde" }), blockages), true);
  assert.equal(matchBelongsToDomain(match("planet_stationary", { point: "Chiron", direction: "direct" }), blockages), true);
  assert.equal(matchBelongsToDomain(match("planet_stationary", { point: "Venus", direction: "direct" }), blockages), false);
  assert.equal(matchBelongsToDomain(match("point_in_house", { point: "South Node", house: 8 }), blockages), true);
  // Existing domains only see stations of their own planets.
  const communication = getDomain("communication");
  assert.ok(communication);
  assert.equal(matchBelongsToDomain(match("planet_stationary", { point: "Mercury", direction: "retrograde" }), communication), true);
  assert.equal(matchBelongsToDomain(match("planet_stationary", { point: "Saturn", direction: "direct" }), communication), false);
  assert.equal(matchBelongsToDomain(match("house_ruler_in_house", { house: 3, ruler: "Sun", rulerHouse: 5 }), communication), true);
});

test("communication domain selects Mercury and houses 3/9, rejects the rest", () => {
  const communication = getDomain("communication");
  assert.ok(communication);
  assert.equal(matchBelongsToDomain(match("planet_in_sign", { point: "Mercury", sign: "Capricorn" }), communication), true);
  assert.equal(matchBelongsToDomain(match("planet_in_sign", { point: "Venus", sign: "Libra" }), communication), false);
  assert.equal(matchBelongsToDomain(match("house_cusp_in_sign", { house: 3, sign: "Leo" }), communication), true);
  assert.equal(matchBelongsToDomain(match("house_cusp_in_sign", { house: 7, sign: "Leo" }), communication), false);
  assert.equal(matchBelongsToDomain(match("planet_in_house", { point: "Jupiter", house: 9 }), communication), true);
  assert.equal(matchBelongsToDomain(match("planet_aspect_planet", { from: "Mercury", to: "Mars", type: "square" }), communication), true);
  assert.equal(matchBelongsToDomain(match("planet_aspect_planet", { from: "Venus", to: "Mars", type: "trine" }), communication), false);
});

test("summary domain takes everything; scaffolds are inert and complete-shaped", () => {
  const summary = getDomain("summary");
  assert.ok(summary);
  assert.equal(matchBelongsToDomain(match("planet_in_sign", { point: "Pluto", sign: "Leo" }), summary), true);
  const chart = { id: "c1", person: { firstName: "A", lastName: "B" } } as unknown as Chart;
  const scaffold = scaffoldReading(chart, summary);
  assert.equal(scaffold.status, "not-started");
  assert.equal(scaffold.sections.length, 0);
  assert.equal(scaffold.slug, "summary");
});

test("shared readings and reports open with the summary, then the usual order", () => {
  // The database returns shared readings sorted by name: career, communication, …
  const alphabetical = READING_DOMAINS.map((d) => d.slug).sort();
  const ordered = [...alphabetical].sort((a, b) => reportOrder(a) - reportOrder(b));
  assert.deepEqual(ordered, ["summary", ...READING_DOMAINS.map((d) => d.slug).filter((slug) => slug !== "summary")]);
  assert.equal(ordered[1], "personality");
  assert.ok(reportOrder("_synastry-x") > reportOrder("purpose-growth"));
});
