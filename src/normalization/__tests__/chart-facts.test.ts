import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeChart } from "../chart-facts";
import type { Chart } from "../../types";

const CHART = {
  id: "chart-test",
  person: { id: "p", firstName: "A", lastName: "B" },
  birth: {
    date: "1990-01-01", time: "10:00", timeKnown: true, place: "X", country: "Y",
    timezone: "UTC", utcOffset: "+00:00", latitude: 0, longitude: 0,
  },
  configuration: { houseSystem: "Placidus", zodiac: "Tropical", ephemeris: "V2" },
  planets: [
    { planet: "Venus", sign: "Virgo", degree: 14, minute: 22, house: 7 },
    { planet: "Sun", sign: "Libra", degree: 19, minute: 14, house: 4, retrograde: false },
  ],
  houses: [{ number: 7, sign: "Leo", degree: 0, minute: 0 }],
  angles: [{ point: "ASC", sign: "Aquarius", degree: 15, minute: 0 }],
  aspects: [
    { id: "venus-square-mars", type: "square", from: "Venus", to: "Mars", orb: "4°12'", applying: true },
  ],
  summary: {} as Chart["summary"],
  status: "active",
  favourite: false,
  confidenceScore: 80,
  createdAt: "2020-01-01",
  lastOpenedAt: "2020-01-02",
  lastOpenedLabel: "now",
} as unknown as Chart;

test("normalizeChart is deterministic and produces stable fact ids", () => {
  const first = normalizeChart(CHART);
  const second = normalizeChart(CHART);
  assert.deepEqual(first, second);
  assert.deepEqual(
    first.facts.map((f) => f.id),
    [
      "fact-planet-venus",
      "fact-planet-sun",
      "fact-angle-asc",
      "fact-house-7",
      "fact-aspect-venus_square_mars",
    ],
  );
  assert.equal(first.id, "chart-input-chart_test");
});

test("facts carry JSON-compatible normalized values", () => {
  const input = normalizeChart(CHART);
  const venus = input.facts.find((f) => f.id === "fact-planet-venus");
  assert.deepEqual(venus?.values, {
    point: "Venus", sign: "Virgo", house: 7, degree: 14, minute: 22, retrograde: false,
  });
});
