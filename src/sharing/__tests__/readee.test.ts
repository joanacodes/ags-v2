import assert from "node:assert/strict";
import { test } from "node:test";
import {
  birthDatePassword,
  parseBirthDateInput,
  passwordCandidates,
  toReadeeChart,
  toReadeeReading,
} from "../readee";
import type { Chart, Reading } from "../../types";
import type { BirthDateInput } from "../readee";

const valueOf = (parsed: BirthDateInput): string | null => (parsed.kind === "invalid" ? null : parsed.value);

test("the password is the birth date as DDMMYYYY", () => {
  assert.equal(birthDatePassword("1990-03-14"), "14031990");
  assert.equal(birthDatePassword("not a date"), null);
  assert.equal(birthDatePassword("1990-02-30"), null);
});

test("common ways of typing a day-first date are accepted", () => {
  for (const typed of ["14031990", "14/03/1990", "14/3/1990", "14.03.1990", "14-3-1990", " 14 03 1990 "]) {
    const parsed = parseBirthDateInput(typed);
    assert.equal(parsed.kind, "date", typed);
    assert.equal(valueOf(parsed), "14031990", typed);
  }
});

test("an unambiguous month-first date is detected and still produces DDMMYYYY", () => {
  const parsed = parseBirthDateInput("03141990");
  assert.equal(parsed.kind, "month-first");
  assert.equal(valueOf(parsed), "14031990");
});

test("ambiguous dates are read day first", () => {
  assert.equal(valueOf(parseBirthDateInput("03041990")), "03041990"); // 3 April
});

test("passwords to try: DDMMYYYY, then the older MMDDYYYY and dd/mm/yyyy, then as typed", () => {
  assert.deepEqual(passwordCandidates("14031990"), ["14031990", "03141990", "14/03/1990"]);
  assert.deepEqual(passwordCandidates("14/03/1990"), ["14031990", "03141990", "14/03/1990"]);
  assert.deepEqual(passwordCandidates("moon-1234"), ["moon-1234"]);
  assert.deepEqual(passwordCandidates("30021990"), ["30021990"]); // 30 Feb: not a date
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
