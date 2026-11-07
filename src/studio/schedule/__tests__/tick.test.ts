/** The tick: what is due when, the outbox's own window, the kill switch, a stalled clock. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { MemoryStore, MemoryStorage } from "../../store/memory";
import { defaultKit } from "../../kit/load";
import { StudioSettings } from "../../settings";
import type { AgentContext } from "../../agents/context";
import { runTick, scheduledDue } from "../tick";
import type { WorkerId } from "../../nodes";

function ctx(store: MemoryStore, now: Date, stored: Record<string, Record<string, unknown>> = {}): AgentContext {
  return { store, storage: new MemoryStorage(), transport: null, kit: defaultKit(), kitVersion: 1, settings: new StudioSettings(stored), now, trigger: "tick", ownerId: "owner", dryRun: true };
}

test("Sunday 06:00 Paris: the strategist, and only in that window", () => {
  const s = new StudioSettings({});
  const at = (iso: string) => new Date(iso);
  assert.deepEqual(scheduledDue(s, at("2026-11-15T04:50:00Z"), at("2026-11-15T05:05:00Z")).map((d) => d.worker), ["strategist"]);
  assert.deepEqual(scheduledDue(s, at("2026-11-15T05:05:00Z"), at("2026-11-15T05:20:00Z")).map((d) => d.worker), []);
  const moved = new StudioSettings({ strategist: { schedule: "30 7 * * 0" } });
  assert.deepEqual(scheduledDue(moved, at("2026-11-15T06:20:00Z"), at("2026-11-15T06:35:00Z")).map((d) => d.worker), ["strategist"], "a schedule changed in Settings is obeyed");
  const off = new StudioSettings({ strategist: { enabled: false } });
  assert.deepEqual(scheduledDue(off, at("2026-11-15T04:50:00Z"), at("2026-11-15T05:05:00Z")), []);
});

test("the tick dispatches what is due, the outbox when a slot is near, and nothing when paused", async () => {
  // 07:00 UTC on 12 November is 08:00 Paris: the community agent's slot, with a Threads post due at 08:20.
  const store = new MemoryStore();
  const [card] = await store.insertCards([{ week: "2026-W46", pillar: "test", language: "en", idea: "i", hook: "h", points: [], figures: [], cta: "test", formats: ["text"] }], "strategist");
  await store.insertPosts([{ card_id: card!.id, platform: "threads", format: "text", language: "en", caption: "c", status: "rendered", scheduled_at: "2026-11-12T07:20:00.000Z" }], "writer-en");
  const sent: WorkerId[] = [];
  const dispatch = async (w: WorkerId) => void sent.push(w);
  const result = await runTick(ctx(store, new Date("2026-11-12T07:00:30Z")), { dispatch, sendEmail: null });
  assert.equal(result.outcome, "ok", result.error ?? "");
  assert.deepEqual([...sent].sort(), ["community", "publish"]);

  sent.length = 0;
  await runTick(ctx(store, new Date("2026-11-12T07:01:00Z"), { global: { paused: true } }), { dispatch, sendEmail: null });
  assert.deepEqual(sent, [], "the kill switch holds");

  sent.length = 0;
  const quiet = new MemoryStore();
  await runTick(ctx(quiet, new Date("2026-11-12T09:31:00Z")), { dispatch, sendEmail: null });
  assert.deepEqual(sent, [], "nothing due, nothing dispatched: no Actions minutes spent");
});

test("a clock that stopped for hours says so, and catches up six hours at most", async () => {
  const store = new MemoryStore();
  const sent: WorkerId[] = [];
  const old = await store.startRun({ agent: "tick", trigger: "tick" });
  await store.finishRun(old.id, { outcome: "ok" });
  // The memory store dates the row with the real clock; the tick is told it is now two days later.
  const now = new Date(Date.parse(old.started_at) + 2 * 86400_000);
  await runTick(ctx(store, now), { dispatch: async (w) => void sent.push(w), sendEmail: null });
  const stalled = (await store.reminders({})).filter((r) => r.kind === "tick-stalled");
  assert.equal(stalled.length, 1);
  assert.ok(sent.filter((w) => w === "community").length <= 1, "a missed day is not replayed run by run");
});
