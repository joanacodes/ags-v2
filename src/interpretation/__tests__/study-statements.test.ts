import assert from "node:assert/strict";
import { test } from "node:test";
import type { GrammarMatch } from "../../grammar/types";
import type { ComposedSentence } from "../composer";
import { buildStatementsPrompt, materialForAnchor, orbMinutes, parseStatements } from "../study-statements";

function match(id: string, structure: string, values: Record<string, string | number | null>): GrammarMatch {
  return { id, ruleId: structure, structure, values, sourceFactIds: [] };
}

const matches: GrammarMatch[] = [
  match("m1", "planet_in_sign", { point: "Venus", sign: "Libra" }),
  match("m2", "planet_in_house", { point: "Venus", house: 7 }),
  match("m3", "planet_aspect_planet", { from: "Venus", to: "Saturn", type: "square", orb: "4°10'" }),
  match("m4", "planet_aspect_planet", { from: "Moon", to: "Venus", type: "trine", orb: "0°45'" }),
  match("m5", "planet_aspect_planet", { from: "Venus", to: "ASC", type: "conjunction", orb: "2°00'" }),
  match("m6", "planet_aspect_planet", { from: "Venus", to: "Mars", type: "sextile", orb: "6°30'" }),
  match("m7", "house_cusp_in_sign", { house: 7, sign: "Aries" }),
  match("m8", "planet_in_house", { point: "Mars", house: 7 }),
];

const sentences = new Map<string, ComposedSentence>(
  matches.map((m) => [
    m.id,
    { matchId: m.id, structure: m.structure, label: m.id, sentence: `sentence ${m.id}`, knowledgeUsed: [], sourceFactIds: [] },
  ]),
);

test("a planet's material: its sign, its house when timed, then its two tightest aspects", () => {
  assert.deepEqual(materialForAnchor(matches, sentences, "Venus", true), [
    "sentence m1",
    "sentence m2",
    "sentence m4",
    "sentence m5",
  ]);
});

test("without a birth time, no house and no aspect to an angle", () => {
  assert.deepEqual(materialForAnchor(matches, sentences, "Venus", false), ["sentence m1", "sentence m4", "sentence m3"]);
});

test("a house's material: its cusp sign and what sits in it", () => {
  assert.deepEqual(materialForAnchor(matches, sentences, "H7", true), ["sentence m2", "sentence m7", "sentence m8"]);
  assert.deepEqual(materialForAnchor(matches, sentences, "H7", false), []);
});

test("orbs read as minutes of arc", () => {
  assert.equal(orbMinutes("4°10'"), 250);
  assert.equal(orbMinutes("0°45'"), 45);
  assert.equal(orbMinutes(null), Number.POSITIVE_INFINITY);
});

test("the model's answer is read back by id, and anything else is refused", () => {
  const parsed = parseStatements('```json\n{"statements":[{"id":"q0","text":" You wait. "},{"id":"q1","text":""}]}\n```');
  assert.ok(parsed !== null);
  assert.equal(parsed.get("q0"), "You wait.");
  assert.equal(parsed.has("q1"), false);
  assert.equal(parseStatements("not json"), null);
  assert.equal(parseStatements('{"statements":[{"id":1,"text":"x"}]}'), null);
});

test("the prompt names the language and lists every item's material under its id", () => {
  const prompt = buildStatementsPrompt([{ id: "q0", area: "love-relationships", material: ["a", "b"] }], "fr");
  assert.match(prompt, /French/);
  assert.match(prompt, /## Item q0 — area of life: Love & Relationships/);
  assert.match(prompt, /- a\n- b/);
});
