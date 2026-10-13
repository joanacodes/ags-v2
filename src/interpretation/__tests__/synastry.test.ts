import assert from "node:assert/strict";
import { test } from "node:test";
import { createCoreKnowledgeRegistry } from "../../knowledge/pack-loader";
import {
  composeSynastry,
  houseOf,
  houseOverlays,
  isSynastrySlug,
  orderPair,
  synastryContacts,
  synastryOverview,
  synastrySlug,
  type SynastryChart,
} from "../synastry";

const SIGNS = [
  "Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo",
  "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces",
] as const;

const at = (sign: (typeof SIGNS)[number], degree: number) => ({ sign, degree, minute: 0 });

// Equal houses from a Libra 0° Ascendant.
const houses = Array.from({ length: 12 }, (_, i) => ({ number: i + 1, ...at(SIGNS[(6 + i) % 12], 0) }));

const A = {
  birth: { timeKnown: true },
  planets: [
    { planet: "Sun", ...at("Aries", 10), house: 7 },
    { planet: "Moon", ...at("Cancer", 5), house: 10 },
    { planet: "Venus", ...at("Taurus", 20), house: 8 },
    { planet: "Mars", ...at("Leo", 1), house: 11 },
    { planet: "Saturn", ...at("Capricorn", 15), house: 4 },
    { planet: "Uranus", ...at("Sagittarius", 5), house: 3 },
    { planet: "Pluto", ...at("Scorpio", 10), house: 2 },
  ],
  angles: [{ point: "ASC", ...at("Libra", 0) }, { point: "MC", ...at("Cancer", 0) }],
  houses,
  points: [],
} as unknown as SynastryChart;

// Birth time unknown: no angles, no houses to read.
const B = {
  birth: { timeKnown: false },
  planets: [
    { planet: "Sun", ...at("Libra", 12), house: 0 },
    { planet: "Moon", ...at("Cancer", 8), house: 0 },
    { planet: "Venus", ...at("Leo", 2), house: 0 },
    { planet: "Mars", ...at("Aquarius", 22), house: 0 },
    { planet: "Uranus", ...at("Sagittarius", 7), house: 0 },
    { planet: "Pluto", ...at("Scorpio", 12), house: 0 },
  ],
  angles: [],
  houses: [],
  points: [],
} as unknown as SynastryChart;

test("contacts between two charts, strongest first", () => {
  const contacts = synastryContacts(A, B);
  const labels = contacts.map((c) => `${c.a} ${c.type} ${c.b}`);
  assert.equal(labels[0], "Mars conjunction Venus");
  for (const expected of ["Sun opposition Sun", "Moon conjunction Moon", "Venus square Mars", "Saturn square Sun"]) {
    assert.ok(labels.includes(expected), expected);
  }
  for (let i = 1; i < contacts.length; i += 1) assert.ok(contacts[i - 1].strength >= contacts[i].strength);
});

test("generational contacts (outer planet to outer planet) are left out", () => {
  const labels = synastryContacts(A, B).map((c) => `${c.a} ${c.type} ${c.b}`);
  assert.ok(!labels.includes("Pluto conjunction Pluto"));
  assert.ok(!labels.includes("Uranus conjunction Uranus"));
});

test("houses wrap around 0° Aries", () => {
  const cusps = Array.from({ length: 12 }, (_, i) => (345 + i * 30) % 360);
  assert.equal(houseOf(5, cusps), 1);
  assert.equal(houseOf(344, cusps), 12);
  assert.equal(houseOf(16, cusps), 2);
});

test("house overlays need the other person's birth time", () => {
  assert.deepEqual(
    houseOverlays(B, A).map((o) => `${o.point} ${o.house}`),
    ["Sun 1", "Moon 10", "Venus 11", "Mars 5", "Uranus 3", "Pluto 2"],
  );
  assert.deepEqual(houseOverlays(A, B), []);
  const overview = synastryOverview(A, B);
  assert.equal(overview.aTimeKnown, true);
  assert.equal(overview.bTimeKnown, false);
});

test("composed sentences name both people and use the knowledge pack", () => {
  const groups = composeSynastry("Clara", "Marc", synastryOverview(A, B), createCoreKnowledgeRegistry());
  const contact = groups[0].items[0];
  assert.equal(contact.label, "Clara's Mars conjunction Marc's Venus");
  assert.match(contact.sentence, /orb 1°00'/);
  assert.match(contact.sentence, /Venus evaluates value/);
  assert.equal(groups[1].title, "Marc's planets in Clara's houses");
  assert.match(groups[1].items[0].sentence, /Marc's Sun in Clara's House 1/);
});

test("pair identity: short stable slug, sample charts never store", () => {
  const slug = synastrySlug("chart-Marie-Christine-de La Rochefoucauld-1760301234567");
  assert.equal(slug, synastrySlug("chart-Marie-Christine-de La Rochefoucauld-1760301234567"));
  assert.ok(slug.length <= 60 && isSynastrySlug(slug) && !isSynastrySlug("love-relationships"));
  const sample = (id: string) => id === "chart-clara-mercer";
  assert.deepEqual(orderPair("chart-clara-mercer", "chart-zoe-1", sample), ["chart-zoe-1", "chart-clara-mercer"]);
  assert.deepEqual(orderPair("chart-b", "chart-a", sample), ["chart-a", "chart-b"]);
});
