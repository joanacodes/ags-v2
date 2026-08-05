import assert from "node:assert/strict";
import { test } from "node:test";
import { formatOrb, mapResponseToChart, splitPosition } from "../freeastroapi";
import type { Chart } from "../../../types";

const BASE = {
  id: "chart-x",
  person: { id: "p", firstName: "A", lastName: "B" },
  birth: {
    date: "1994-12-28", time: "17:15", timeKnown: true, place: "Bourg-la-Reine",
    country: "France", timezone: "Europe/Paris", utcOffset: "UTC +1:00",
    latitude: 48.78, longitude: 2.31,
  },
  configuration: { houseSystem: "Placidus", zodiac: "Tropical", ephemeris: "FreeAstroAPI" },
  planets: [], houses: [], angles: [], aspects: [],
  summary: {
    sun: { degree: 0, minute: 0, sign: "Aries", house: 1 },
    moon: { degree: 0, minute: 0, sign: "Aries", house: 1 },
    ascendant: { degree: 0, minute: 0, sign: "Aries" },
    chartRuler: { planet: "Mars", position: "Pending" },
    dominantElement: "Fire", dominantModality: "Cardinal",
    dominantPlanets: [], strongestHouses: [], majorThemes: [], insights: [],
  },
  status: "processing", favourite: false, confidenceScore: 0,
  createdAt: "2026-08-04", lastOpenedAt: "2026-08-04", lastOpenedLabel: "now",
} as unknown as Chart;

const RESPONSE = {
  planets: [
    { name: "Sun", sign: "Cap", sign_id: "capricorn", pos: 6.55, house: 7, retrograde: false },
    { name: "Moon", sign: "Tau", pos: 21.0, house: 11, retrograde: false },
    { name: "Chiron", sign: "Vir", sign_id: "virgo", pos: 1.2, house: 3, retrograde: true },
  ],
  houses: [{ house: 1, sign: "Can", sign_id: "cancer", pos: 12.5 }],
  angles_details: {
    asc: { sign: "Can", sign_id: "cancer", pos: 12.5 },
    mc: { sign: "Pis", sign_id: "pisces", pos: 3.25 },
    vertex: { sign: "Sco", sign_id: "scorpio", pos: 25.34, house: 5 },
  },
  aspects: [
    { p1: "Sun", p2: "Moon", type: "Trine", orb: 4.2, is_major: true, is_applying: true },
    { p1: "Sun", p2: "Moon", type: "quintile", orb: 1.0, is_major: false, is_applying: false },
  ],
  dominants: { dominant_element: "earth", dominant_modality: "cardinal" },
  dominants_profile: { dominant_planets: [{ name: "Sun", rank: 1 }, { name: "Moon", rank: 2 }] },
  confidence: { overall: "high" },
};

test("position splitting and orb formatting are exact", () => {
  assert.deepEqual(splitPosition(6.55), { degree: 6, minute: 33 });
  assert.deepEqual(splitPosition(0), { degree: 0, minute: 0 });
  assert.equal(formatOrb(4.2), "4°12'");
});

test("maps a real-shaped response onto the v2 chart", () => {
  const chart = mapResponseToChart(BASE, RESPONSE);
  assert.equal(chart.status, "active");
  assert.equal(chart.summary.sun.sign, "Capricorn");
  assert.equal(chart.summary.sun.house, 7);
  assert.equal(chart.summary.ascendant.sign, "Cancer");
  assert.equal(chart.summary.chartRuler.planet, "Moon"); // Cancer ruler
  assert.equal(chart.summary.dominantElement, "Earth");
  // Chiron is outside the v2 planet set and must be skipped, not invented.
  assert.deepEqual(chart.planets.map((p) => p.planet), ["Sun", "Moon"]);
  // Minor aspects are filtered; the trine survives with a formatted orb.
  assert.deepEqual(chart.aspects.map((a) => [a.type, a.orb]), [["trine", "4°12'"]]);
  assert.equal(chart.confidenceScore, 90);
});

test("mapping is deterministic", () => {
  assert.deepEqual(mapResponseToChart(BASE, RESPONSE), mapResponseToChart(BASE, RESPONSE));
});

test("untimed responses (no houses/angles) map without invented houses", () => {
  const untimed = {
    planets: [{ name: "Sun", sign: "Sco", sign_id: "scorpio", pos: 10.84, retrograde: false }],
    aspects: [],
    confidence: { overall: "medium" },
  };
  const chart = mapResponseToChart(BASE, untimed);
  assert.equal(chart.planets[0].sign, "Scorpio");
  assert.equal(chart.planets[0].house, 0); // no house — never invented
  assert.equal(chart.houses.length, 0);
  assert.equal(chart.confidenceScore, 70);
});

test("abbreviation-only signs (no sign_id) still decode", () => {
  const abbrevOnly = {
    planets: [{ name: "Moon", sign: "Sag", pos: 2.18, house: 5, retrograde: true }],
  };
  const chart = mapResponseToChart(BASE, abbrevOnly);
  assert.equal(chart.planets[0].sign, "Sagittarius");
  assert.equal(chart.planets[0].retrograde, true);
});

test("extra bodies map into points, not planets; vertex included", () => {
  const chart = mapResponseToChart(BASE, RESPONSE);
  const names = (chart.points ?? []).map((p) => p.point);
  assert.ok(names.includes("Chiron"));
  assert.ok(names.includes("Vertex"));
  const vertex = (chart.points ?? []).find((p) => p.point === "Vertex");
  assert.equal(vertex?.sign, "Scorpio");
  assert.equal(vertex?.house, 5);
  // Chiron must NOT leak into the planets array.
  assert.ok(!chart.planets.some((p) => String(p.planet) === "Chiron"));
});
