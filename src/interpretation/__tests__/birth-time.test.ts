import assert from "node:assert/strict";
import { test } from "node:test";
import { hasBirthTime } from "../../lib/birth-time";
import { generateDomainReading } from "../reading-pipeline";
import charts from "../../data/sample-charts.json";
import type { Chart } from "../../types";

const sample = (charts as unknown as { charts: Chart[] }).charts;

test("a birth time is a time the chart says is known", () => {
  const timed = sample.find((c) => c.birth.timeKnown)!;
  const untimed = sample.find((c) => !c.birth.timeKnown)!;
  assert.equal(hasBirthTime(timed), true);
  assert.equal(hasBirthTime(untimed), false);
  // a time left over on a chart marked unknown does not count, nor does an empty one
  assert.equal(hasBirthTime({ birth: { ...timed.birth, timeKnown: false } }), false);
  assert.equal(hasBirthTime({ birth: { ...timed.birth, time: " " } }), false);
});

test("no birth time, no reading: the reading is refused before any AI is asked", async () => {
  const untimed = sample.find((c) => !c.birth.timeKnown && c.planets.length > 0)!;
  const outcome = await generateDomainReading(untimed, "personality");
  assert.deepEqual(outcome, { status: "no_birth_time" });
});
