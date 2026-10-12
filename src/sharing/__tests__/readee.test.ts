import assert from "node:assert/strict";
import { test } from "node:test";
import {
  birthDatePassword,
  canonicalPassword,
  parseBirthDateInput,
  toReadeeChart,
  toReadeeReading,
} from "../readee";
import type { Chart, Reading } from "../../types";

test("the password is the birth date written dd/mm/yyyy", () => {
  assert.equal(birthDatePassword("1990-03-14"), "14/03/1990");
  assert.equal(birthDatePassword("not a date"), null);
  assert.equal(birthDatePassword("1990-02-30"), null);
});

test("common ways of typing a day-first date are accepted", () => {
  for (const typed of ["14/03/1990", "14/3/1990", "14.03.1990", "14-03-1990", " 14 03 1990 ", "14031990"]) {
    assert.deepEqual(parseBirthDateInput(typed), { kind: "date", value: "14/03/1990" }, typed);
  }
});

test("an unambiguous month-first date is detected and corrected", () => {
  assert.deepEqual(parseBirthDateInput("03/14/1990"), { kind: "month-first", value: "14/03/1990" });
  assert.equal(canonicalPassword("03/14/1990"), "14/03/1990");
});

test("ambiguous dates stay day-first; non-dates pass through unchanged", () => {
  assert.deepEqual(parseBirthDateInput("03/04/1990"), { kind: "date", value: "03/04/1990" });
  assert.equal(canonicalPassword("moon-1234"), "moon-1234");
  assert.equal(canonicalPassword("31/02/1990"), "31/02/1990");
});

test("the readee never receives the AI model, configuration or astrologer notes", () => {
  const chart = {
    id: "c1",
    person: { id: "p1", firstName: "Ana", lastName: "Lima", notes: "private note", gender: "f" },
    birth: { date: "1990-03-14" },
    configuration: { houseSystem: "Placidus", zodiac: "Tropical", ephemeris: "x", aiModel: "claude-fable-5-1" },
    planets: [],
    houses: [],
    angles: [],
    aspects: [],
    confidenceScore: 80,
  } as unknown as Chart;
  const shared = JSON.stringify(toReadeeChart(chart));
  assert.ok(!shared.includes("claude"));
  assert.ok(!shared.includes("private note"));
  assert.ok(!shared.includes("configuration"));

  const reading = {
    slug: "career",
    title: "Career",
    sections: [],
    confidence: { stars: 4 },
    chartFactors: [],
  } as unknown as Reading;
  assert.deepEqual(Object.keys(toReadeeReading(reading)).sort(), ["sections", "slug", "title"]);
});
