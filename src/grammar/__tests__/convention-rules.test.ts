/**
 * TASK-0012 — convention-backed rules: house rulers and stations.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { GrammarExecutor } from "../executor";
import { GrammarRegistry } from "../registry";
import type { GrammarRule } from "../rule";
import { createHouseRulerRule, createStationRule } from "../rules/convention-rules";
import type { NormalizedGrammarInput } from "../types";

const MODERN = {
  tradition: "modern",
  rulers: { Gemini: "Mercury", Virgo: "Mercury", Leo: "Sun", Taurus: "Venus", Libra: "Venus" },
};
const THRESHOLDS = { thresholds: { Mercury: 0.14, Sun: 0.1, Saturn: 0.003 } };

const INPUT: NormalizedGrammarInput = {
  id: "input-x",
  facts: [
    {
      id: "fact-planet-mercury",
      structure: "planet_position",
      values: { point: "Mercury", sign: "Scorpio", house: 6, degree: 15, minute: 48, retrograde: true, speed: -0.005 },
    },
    {
      id: "fact-planet-sun",
      structure: "planet_position",
      values: { point: "Sun", sign: "Libra", house: 5, degree: 25, minute: 31, retrograde: false, speed: 0.99 },
    },
    {
      id: "fact-planet-saturn",
      structure: "planet_position",
      values: { point: "Saturn", sign: "Taurus", house: 12, degree: 29, minute: 51, retrograde: true },
    },
    {
      id: "fact-planet-venus",
      structure: "planet_position",
      values: { point: "Venus", sign: "Libra", house: 5, degree: 1, minute: 0, retrograde: false },
    },
    { id: "fact-house-1", structure: "house_cusp", values: { number: 1, sign: "Gemini", degree: 16, minute: 7 } },
    { id: "fact-house-3", structure: "house_cusp", values: { number: 3, sign: "Leo", degree: 4, minute: 39 } },
    { id: "fact-house-4", structure: "house_cusp", values: { number: 4, sign: "Virgo", degree: 1, minute: 59 } },
    { id: "fact-house-5", structure: "house_cusp", values: { number: 5, sign: "Libra", degree: 4, minute: 39 } },
    { id: "fact-house-12", structure: "house_cusp", values: { number: 12, sign: "Taurus", degree: 11, minute: 7 } },
  ],
};

async function run(rules: readonly GrammarRule[]) {
  const registry = new GrammarRegistry();
  for (const rule of rules) registry.register(rule);
  return new GrammarExecutor().execute(INPUT, {}, registry);
}

test("house rulers: one match per cusp whose ruler is placed, linking both houses", async () => {
  const result = await run([createHouseRulerRule(MODERN)]);
  assert.deepEqual(result.diagnostics, []);
  assert.deepEqual(
    result.matches.map((m) => [m.values.house, m.values.ruler, m.values.rulerHouse]),
    [
      [1, "Mercury", 6],
      [3, "Sun", 5],
      [4, "Mercury", 6],
      [5, "Venus", 5],
      [12, "Venus", 5],
    ],
  );
  const third = result.matches[1];
  assert.equal(third.id, "hr-input-x-03");
  assert.equal(third.values.tradition, "modern");
  assert.deepEqual(third.sourceFactIds, ["fact-house-3", "fact-planet-sun"]);
  assert.deepEqual(third.metadata?.knowledgeRefs, ["houses/house_3", "planets/sun", "houses/house_5"]);
  // A ruler in its own house references that house once.
  assert.deepEqual(result.matches[3].metadata?.knowledgeRefs, ["houses/house_5", "planets/venus"]);
});

test("stations: within threshold only; facts without a speed are skipped", async () => {
  const result = await run([createStationRule(THRESHOLDS)]);
  assert.deepEqual(result.diagnostics, []);
  assert.equal(result.matches.length, 1);
  const [mercury] = result.matches;
  assert.equal(mercury.id, "st-input-x-fact-planet-mercury");
  assert.deepEqual(mercury.values, {
    point: "Mercury", speed: -0.005, threshold: 0.14, direction: "retrograde",
  });
  assert.deepEqual(mercury.metadata?.knowledgeRefs, ["planets/mercury", "conditions/station"]);
});

test("missing conventions become diagnostics, never matches or guesses", async () => {
  const result = await run([createHouseRulerRule(null), createStationRule(null)]);
  assert.deepEqual(result.matches, []);
  assert.deepEqual(
    result.diagnostics.map((d) => [d.ruleId, d.code]),
    [
      ["natal.house_ruler_in_house", "RULE_UNSUPPORTED_INPUT"],
      ["natal.planet_stationary", "RULE_UNSUPPORTED_INPUT"],
    ],
  );
});

test("convention rules are deterministic", async () => {
  const rules = [createHouseRulerRule(MODERN), createStationRule(THRESHOLDS)];
  assert.deepEqual(await run(rules), await run(rules));
});
