import assert from "node:assert/strict";
import { test } from "node:test";
import { formatOrb, pointContacts } from "../point-contacts";
import { getDomain } from "../domains";
import { PROMPT_KEYS, deepPromptKey, defaultPrompts } from "../prompts";
import type { Chart } from "../../types";

const chart = {
  planets: [
    { planet: "Moon", sign: "Aries", degree: 12, minute: 0, house: 1 },
    { planet: "Venus", sign: "Leo", degree: 2, minute: 0, house: 5 },
    { planet: "Saturn", sign: "Virgo", degree: 20, minute: 0, house: 6 },
  ],
  angles: [{ point: "ASC", sign: "Pisces", degree: 29, minute: 30 }],
  points: [
    { point: "Chiron", sign: "Cancer", degree: 10, minute: 30, house: 4 },
    { point: "Lilith", sign: "Leo", degree: 4, minute: 0, house: 5 },
  ],
} as unknown as Pick<Chart, "planets" | "angles" | "points">;

test("Chiron and Lilith contacts are measured from positions, tightest first", () => {
  const contacts = pointContacts(chart, ["Chiron", "Lilith"]);
  const labels = contacts.map((c) => `${c.from} ${c.type} ${c.to}`);
  assert.deepEqual(labels, ["Chiron square Moon", "Lilith conjunction Venus", "Lilith trine ASC"]);
  assert.equal(formatOrb(contacts[0].orb), "1°30'");
});

test("signs wrap around Pisces/Aries and each pair is listed once", () => {
  const wrap = {
    planets: [{ planet: "Mars", sign: "Aries", degree: 1, minute: 0, house: 1 }],
    angles: [],
    points: [
      { point: "Chiron", sign: "Pisces", degree: 28, minute: 0, house: 12 },
      { point: "Lilith", sign: "Pisces", degree: 29, minute: 0, house: 12 },
    ],
  } as unknown as Pick<Chart, "planets" | "angles" | "points">;
  const labels = pointContacts(wrap, ["Chiron", "Lilith"]).map((c) => `${c.from} ${c.type} ${c.to}`);
  assert.deepEqual(labels.sort(), ["Chiron conjunction Lilith", "Chiron conjunction Mars", "Lilith conjunction Mars"]);
});

test("no Chiron or Lilith in the chart: no contacts", () => {
  assert.deepEqual(pointContacts({ ...chart, points: [] }, ["Chiron", "Lilith"]), []);
});

test("pain and love are deep readings with their own editable prompt", () => {
  for (const slug of ["pain-healing", "love-relationships"]) {
    assert.equal(getDomain(slug)?.deep, true);
    const key = deepPromptKey(slug);
    assert.ok(key !== null && PROMPT_KEYS.includes(key));
    assert.ok(defaultPrompts()[key].length > 500);
  }
  assert.equal(deepPromptKey("career"), null);
  assert.match(defaultPrompts()["reading.deep.pain-healing"], /Saturn[\s\S]*Chiron[\s\S]*Lilith/);
  assert.match(defaultPrompts()["reading.deep.pain-healing"], /less favourable/);
});

test("a node can be a source when asked for; node-to-node is never a contact", () => {
  const nodes = {
    planets: [{ planet: "Saturn", sign: "Capricorn", degree: 21, minute: 0, house: 8 }],
    angles: [],
    points: [
      { point: "North Node", sign: "Cancer", degree: 19, minute: 38, house: 2 },
      { point: "South Node", sign: "Capricorn", degree: 19, minute: 38, house: 8 },
      { point: "Lilith", sign: "Capricorn", degree: 24, minute: 47, house: 8 },
    ],
  } as unknown as Pick<Chart, "planets" | "angles" | "points">;
  const both = pointContacts(nodes, ["South Node", "North Node"]).map((c) => `${c.from} ${c.type} ${c.to}`);
  assert.deepEqual(both.sort(), [
    "North Node opposition Lilith",
    "North Node opposition Saturn",
    "South Node conjunction Lilith",
    "South Node conjunction Saturn",
  ]);
  // A node that is not a source is not a target either.
  const lilithOnly = pointContacts(nodes, ["Lilith"]).map((c) => `${c.from} ${c.type} ${c.to}`);
  assert.deepEqual(lilithOnly, ["Lilith conjunction Saturn"]);
});
