import assert from "node:assert/strict";
import { test } from "node:test";
import { formatAgo } from "../format";

test("formatAgo reads elapsed time in words", () => {
  const now = new Date("2026-10-13T12:00:00Z");
  const ago = (ms: number) => formatAgo(new Date(now.getTime() - ms).toISOString(), now);
  const MIN = 60_000;
  const HOUR = 60 * MIN;
  const DAY = 24 * HOUR;
  assert.equal(ago(20_000), "Just now");
  assert.equal(ago(5 * MIN), "5 min ago");
  assert.equal(ago(3 * HOUR), "3h ago");
  assert.equal(ago(30 * HOUR), "Yesterday");
  assert.equal(ago(4 * DAY), "4 days ago");
  assert.equal(ago(8 * DAY), "1 week ago");
  assert.equal(ago(20 * DAY), "2 weeks ago");
  assert.equal(ago(60 * DAY), "14 Aug 2026");
  assert.equal(formatAgo(new Date(now.getTime() + 5 * MIN).toISOString(), now), "Just now");
  assert.equal(formatAgo("not a date", now), "");
});
