import assert from "node:assert/strict";
import { test } from "node:test";
import { GrammarExecutor } from "../../grammar/executor";
import { GrammarRegistry } from "../../grammar/registry";
import { NATAL_RULES } from "../../grammar/rules/natal-rules";
import { createCoreKnowledgeRegistry } from "../../knowledge/pack-loader";
import { composeSentences } from "../composer";
import type { NormalizedGrammarInput } from "../../grammar/types";

const INPUT: NormalizedGrammarInput = {
  id: "chart-input-test",
  facts: [
    {
      id: "fact-planet-venus",
      structure: "planet_position",
      values: { point: "Venus", sign: "Libra", house: 7, degree: 1, minute: 0, retrograde: false },
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
  const grammar = new GrammarRegistry();
  for (const rule of NATAL_RULES) grammar.register(rule);
  const execution = await new GrammarExecutor().execute(INPUT, {}, grammar);
  return composeSentences(execution.matches, createCoreKnowledgeRegistry());
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
