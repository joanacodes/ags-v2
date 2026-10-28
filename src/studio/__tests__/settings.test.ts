import { test } from "node:test";
import assert from "node:assert/strict";
import { StudioSettings, resolveSettings } from "../settings";

test("defaults hold when nothing is stored", () => {
  const s = new StudioSettings({});
  assert.equal(s.get("strategist").schedule, "0 6 * * 0");
  assert.equal(s.get("global").weekly_cap_usd, 10);
  assert.equal(s.model("strategist").model, "claude-opus-5-5");
  assert.equal(s.model("community-classify").model, "claude-haiku-5-5");
  assert.equal(s.get("reminders").kinds["approve-week"].on, true);
  assert.equal(s.get("reminders").kinds["sky-event"].on, false);
  assert.deepEqual(s.get("reminders").kinds["cap-near"].channels, ["in_app", "email"]);
});

test("the owner's change wins, and a bad value is ignored for that field only", () => {
  const s = new StudioSettings({
    strategist: { schedule: "30 5 * * 0", cards_max: "lots" },
    models: { "writer-en": { effort: "low" } },
  });
  assert.equal(s.get("strategist").schedule, "30 5 * * 0");
  assert.equal(s.get("strategist").cards_max, 60);
  assert.equal(s.model("writer-en").effort, "low");
  assert.equal(s.model("writer-en").model, "claude-sonnet-5-5");
  const { ignored } = resolveSettings("strategist", { cards_max: "lots", nonsense: 1 });
  assert.equal(ignored.length, 2);
  assert.deepEqual(Object.keys(s.problems()), ["strategist"]);
});

test("platform nodes share one schema", () => {
  const s = new StudioSettings({ "platform-threads": { slots: ["08:00"] } });
  assert.deepEqual(s.platform("threads").slots, ["08:00"]);
  assert.equal(s.platform("bluesky").slots, null);
});
