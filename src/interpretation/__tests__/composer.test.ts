import assert from "node:assert/strict";
import { test } from "node:test";
import { GrammarExecutor } from "../../grammar/executor";
import { GrammarRegistry } from "../../grammar/registry";
import { createHouseRulerRule, createStationRule } from "../../grammar/rules/convention-rules";
import { NATAL_RULES } from "../../grammar/rules/natal-rules";
import { loadRulershipTable, loadStationThresholds } from "../../knowledge/conventions";
import { createCoreKnowledgeRegistry } from "../../knowledge/pack-loader";
import { composeSentences } from "../composer";
import type { NormalizedGrammarInput } from "../../grammar/types";

const INPUT: NormalizedGrammarInput = {
  id: "chart-input-test",
  facts: [
    {
      id: "fact-planet-venus",
      structure: "planet_position",
      values: { point: "Venus", sign: "Libra", house: 7, degree: 1, minute: 0, retrograde: false, speed: 0.05 },
    },
    {
      id: "fact-house-7",
      structure: "house_cusp",
      values: { number: 7, sign: "Libra", degree: 0, minute: 0 },
    },
    {
      id: "fact-aspect-a1",
      structure: "aspect",
      values: { from: "Venus", to: "Mars", type: "square", orb: "4°12'", applying: true },
    },
    {
      id: "fact-planet-unknown",
      structure: "planet_position",
      values: { point: "Vulcan", sign: "Libra", house: 2, degree: 0, minute: 0, retrograde: false },
    },
  ],
};

async function run() {
  const knowledge = createCoreKnowledgeRegistry();
  const grammar = new GrammarRegistry();
  for (const rule of NATAL_RULES) grammar.register(rule);
  grammar.register(createHouseRulerRule(loadRulershipTable(knowledge)));
  grammar.register(createStationRule(loadStationThresholds(knowledge)));
  const execution = await new GrammarExecutor().execute(INPUT, {}, grammar);
  return composeSentences(execution.matches, knowledge);
}

test("composition is deterministic", async () => {
  assert.deepEqual(await run(), await run());
});

test("sentences are grounded in knowledge and carry provenance", async () => {
  const result = await run();
  const inSign = result.groups.find((g) => g.structure === "planet_in_sign");
  const venus = inSign?.items.find((i) => i.label === "Venus in Libra");
  assert.ok(venus, "Venus in Libra sentence exists");
  assert.match(venus.sentence, /Venus/);
  assert.ok(venus.knowledgeUsed.includes("planets/venus"));
  assert.ok(venus.knowledgeUsed.includes("signs/libra"));
  const aspects = result.groups.find((g) => g.structure === "planet_aspect_planet");
  assert.match(aspects?.items[0]?.sentence ?? "", /square/);
});

test("unknown entities produce diagnostics, never invented meaning", async () => {
  const result = await run();
  const unresolved = result.diagnostics.filter((d) => d.code === "KNOWLEDGE_UNRESOLVED");
  assert.ok(unresolved.some((d) => d.message.includes("planets/vulcan")));
  for (const group of result.groups) {
    for (const item of group.items) {
      assert.ok(!item.sentence.includes("Vulcan evaluates"));
    }
  }
});

test("house rulers and stations compose grounded sentences", async () => {
  const result = await run();
  const rulers = result.groups.find((g) => g.structure === "house_ruler_in_house");
  const venusRules = rulers?.items.find((i) => i.label === "House 7 ruler Venus in House 7");
  assert.ok(venusRules, "ruler sentence exists");
  assert.match(venusRules.sentence, /modern rulership/);
  assert.match(venusRules.sentence, /its own house/);
  assert.ok(venusRules.knowledgeUsed.includes("houses/house_7"));
  assert.ok(venusRules.knowledgeUsed.includes("planets/venus"));
  const stations = result.groups.find((g) => g.structure === "planet_stationary");
  const still = stations?.items.find((i) => i.label === "Venus stationary");
  assert.ok(still, "station sentence exists");
  assert.match(still.sentence, /stationary at birth, direct/);
  assert.ok(still.knowledgeUsed.includes("conditions/station"));
  // Group order keeps rulers next to cusps and stations next to retrogrades.
  const order = result.groups.map((g) => g.structure);
  assert.ok(order.indexOf("planet_stationary") < order.indexOf("house_ruler_in_house"));
  assert.ok(order.indexOf("house_ruler_in_house") < order.indexOf("planet_aspect_planet"));
});
