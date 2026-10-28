import { test } from "node:test";
import assert from "node:assert/strict";
import { daysOf, fromParis, isoWeekOf, mondayOf, nextWeek, parisDate, parisTime, parisWeek, weekStart } from "../../time";
import { describeCron, dueBetween, isValidCron, nextRun, parseCron } from "../cron";

test("Paris wall time converts to UTC on both sides of the clock change", () => {
  // Winter (CET, UTC+1) and summer (CEST, UTC+2).
  assert.equal(fromParis("2026-11-16", "07:30").toISOString(), "2026-11-16T06:30:00.000Z");
  assert.equal(fromParis("2026-07-01", "07:30").toISOString(), "2026-07-01T05:30:00.000Z");
  // The spring change: 2027-03-28 at 02:00 Paris the clocks jump to 03:00.
  assert.equal(fromParis("2027-03-28", "04:00").toISOString(), "2027-03-28T02:00:00.000Z");
  const d = new Date("2026-11-09T07:02:00Z");
  assert.equal(parisDate(d), "2026-11-09");
  assert.equal(parisTime(d), "08:02");
});

test("ISO weeks: the launch week is 2026-W47, Monday 16 November", () => {
  assert.equal(isoWeekOf("2026-11-16"), "2026-W47");
  assert.equal(mondayOf("2026-W47"), "2026-11-16");
  assert.deepEqual(daysOf("2026-W47").slice(0, 2), ["2026-11-16", "2026-11-17"]);
  assert.equal(nextWeek("2026-W53"), "2027-W01");
  assert.equal(isoWeekOf("2027-01-01"), "2026-W53");
  // Sunday 22:30 UTC is already Monday in Paris.
  assert.equal(parisWeek(new Date("2026-11-15T23:30:00Z")), "2026-W47");
  assert.equal(weekStart(new Date("2026-11-18T12:00:00Z")).toISOString(), "2026-11-15T23:00:00.000Z");
});

test("a schedule written in Paris time fires at the Paris time, summer or winter", () => {
  const sunday6 = parseCron("0 6 * * 0");
  const winter = dueBetween(sunday6, new Date("2026-11-15T04:50:00Z"), new Date("2026-11-15T05:05:00Z"));
  assert.deepEqual(winter.map((d) => d.toISOString()), ["2026-11-15T05:00:00.000Z"]);
  const summer = dueBetween(sunday6, new Date("2027-06-06T03:50:00Z"), new Date("2027-06-06T04:05:00Z"));
  assert.deepEqual(summer.map((d) => d.toISOString()), ["2027-06-06T04:00:00.000Z"]);
  assert.equal(nextRun(parseCron("0 8,18 * * *"), new Date("2026-11-16T07:30:00Z"))?.toISOString(), "2026-11-16T17:00:00.000Z");
});

test("schedules read back in words, and bad ones are refused", () => {
  assert.equal(describeCron("0 6 * * 0"), "Sunday at 06:00");
  assert.equal(describeCron("0 8,18 * * *"), "every day at 08:00 and 18:00");
  assert.equal(describeCron("0 7 * * 5"), "Friday at 07:00");
  assert.equal(describeCron("30 9 * * 1-5"), "weekdays at 09:30");
  assert.equal(isValidCron("61 * * * *"), false);
  assert.equal(isValidCron("0 6 * *"), false);
});
