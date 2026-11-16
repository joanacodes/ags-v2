import assert from "node:assert/strict";
import { test } from "node:test";
import { birthUtcOffsetLabel, utcOffsetLabel } from "../geo";

// TASK-0019: the label stored with a chart is the offset at the birth, not on the day the chart is made.

test("a Paris winter birth is UTC +1:00 whatever the season today", () => {
  assert.equal(birthUtcOffsetLabel("Europe/Paris", "1997-01-02", "17:15"), "UTC +1:00");
});

test("a Paris summer birth is UTC +2:00", () => {
  assert.equal(birthUtcOffsetLabel("Europe/Paris", "1997-07-02", "17:15"), "UTC +2:00");
});

test("negative and half-hour offsets keep their sign and minutes", () => {
  assert.equal(birthUtcOffsetLabel("America/New_York", "1990-01-15", "08:00"), "UTC -5:00");
  assert.equal(birthUtcOffsetLabel("America/New_York", "1990-07-15", "08:00"), "UTC -4:00");
  assert.equal(birthUtcOffsetLabel("Asia/Kolkata", "2001-03-03", "10:30"), "UTC +5:30");
  assert.equal(birthUtcOffsetLabel("America/St_Johns", "2005-01-10", "12:00"), "UTC -3:30");
});

test("the zone's history counts: London kept summer time all year from 1968 to 1971", () => {
  assert.equal(birthUtcOffsetLabel("Europe/London", "1969-01-15", "12:00"), "UTC +1:00");
  assert.equal(birthUtcOffsetLabel("Europe/London", "1975-01-15", "12:00"), "UTC +0:00");
});

test("a birth without a time is read at noon", () => {
  assert.equal(birthUtcOffsetLabel("Europe/Paris", "1997-01-02"), "UTC +1:00");
  assert.equal(birthUtcOffsetLabel("Europe/Paris", "1997-01-02", undefined), "UTC +1:00");
});

test("the hour of a clock change resolves to the offset in force after the instant", () => {
  // Paris moved to summer time at 02:00 local on 30 March 1997; 03:30 that night is already UTC +2:00.
  assert.equal(birthUtcOffsetLabel("Europe/Paris", "1997-03-30", "03:30"), "UTC +2:00");
  assert.equal(birthUtcOffsetLabel("Europe/Paris", "1997-03-30", "01:30"), "UTC +1:00");
});

test("an unreadable zone or date gives null, so the caller keeps its own label", () => {
  assert.equal(birthUtcOffsetLabel("Not/A_Zone", "1997-01-02", "17:15"), null);
  assert.equal(birthUtcOffsetLabel("AUTO", "1997-01-02", "17:15"), null);
  assert.equal(birthUtcOffsetLabel("", "1997-01-02", "17:15"), null);
  assert.equal(birthUtcOffsetLabel("Europe/Paris", "02/01/1997", "17:15"), null);
});

test("today's label keeps its old format and fallback", () => {
  assert.match(utcOffsetLabel("Europe/Paris"), /^UTC \+[12]:00$/);
  assert.equal(utcOffsetLabel("UTC"), "UTC +0:00");
  assert.equal(utcOffsetLabel("Not/A_Zone"), "UTC +0:00");
});
