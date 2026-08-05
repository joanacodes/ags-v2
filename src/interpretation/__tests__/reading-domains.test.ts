import assert from "node:assert/strict";
import { test } from "node:test";
import { READING_DOMAINS, getDomain } from "../domains";
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

test("all 11 domains exist with unique slugs", () => {
  assert.equal(READING_DOMAINS.length, 11);
  assert.equal(new Set(READING_DOMAINS.map((d) => d.slug)).size, 11);
  assert.ok(getDomain("communication"));
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
