import { test } from "node:test";
import assert from "node:assert/strict";
import { MemoryStore, MemoryStorage } from "../../store/memory";
import { defaultKit } from "../../kit/load";
import { StudioSettings } from "../../settings";
import { runStrategist } from "../strategist";
import { FakeTransport } from "./fake-transport";
import type { AgentContext } from "../context";

function context(store: MemoryStore, transport: FakeTransport, now: Date): AgentContext {
  return { store, storage: new MemoryStorage(), transport, kit: defaultKit(), kitVersion: 1, settings: new StudioSettings({}), now, trigger: "manual", ownerId: "owner-1", dryRun: true };
}

test("a Sunday run plans the launch week: cards, pieces, gate, slots", async () => {
  const store = new MemoryStore();
  const transport = new FakeTransport();
  // Sunday 15 November 2026, 06:00 Paris: the run plans the launch week (W47).
  const now = new Date("2026-11-15T05:00:00Z");
  const result = await runStrategist(context(store, transport, now));
  assert.equal(result.outcome, "ok", result.error ?? "");

  const cards = await store.cards({ weeks: ["2026-W47"] });
  assert.ok(cards.length >= 45 && cards.length <= 60, `cards: ${cards.length}`);
  assert.ok(cards.every((c) => c.status === "draft" && c.kit_version === 1));

  const posts = await store.posts({});
  assert.ok(posts.length > 40, `posts: ${posts.length}`);
  const failed = posts.filter((p) => p.status === "failed");
  assert.deepEqual(failed.map((p) => p.gate?.failures), [], "no piece of the fake week should fail the gate");

  // Slots: Paris times from the kit, inside the week, never two pieces at once on a platform.
  const scheduled = posts.filter((p) => p.scheduled_at);
  assert.ok(scheduled.length > 30);
  const seen = new Set<string>();
  for (const p of scheduled) {
    const key = `${p.platform}|${p.scheduled_at}`;
    assert.ok(!seen.has(key), `two pieces at once: ${key}`);
    seen.add(key);
  }
  const tiktok = scheduled.filter((p) => p.platform === "tiktok");
  assert.ok(tiktok.length <= 14, `tiktok: ${tiktok.length}`);
  assert.ok(tiktok.every((p) => p.by_hand), "TikTok is posted by hand");
  assert.ok(tiktok.every((p) => ["06:30", "17:30"].includes(p.scheduled_at!.slice(11, 16))), "07:30 and 18:30 Paris are 06:30 and 17:30 UTC in November");

  // The mechanical parts are the code's: the disclosure on voiced pieces, the src tag on links.
  for (const p of posts.filter((p) => p.format === "video" && p.platform !== "youtube")) assert.ok(p.caption?.includes("AI voice") || p.caption?.includes("Voix de synthèse"));
  for (const p of posts.filter((p) => p.platform === "youtube")) assert.ok(p.description?.includes("?src=yt"));
  for (const p of posts.filter((p) => p.platform === "threads" && p.language === "fr")) assert.ok(!p.caption?.includes("?src=th") || p.caption.includes("/fr/test/"));

  // French never goes to Instagram, TikTok or YouTube.
  assert.ok(!posts.some((p) => p.language === "fr" && ["instagram", "tiktok", "youtube"].includes(p.platform)));

  // The run is on record with its cost, and the audit trail has every new card.
  const runs = await store.runs({ agent: "strategist" });
  assert.equal(runs[0]?.outcome, "ok");
  assert.ok((runs[0]?.cost_usd ?? 0) > 0);
  // Each writer's spend is on its own run, so its weekly cap reads its own agent alone.
  for (const writer of ["writer-en", "writer-fr"]) {
    const w = await store.runs({ agent: writer });
    assert.equal(w.length, 1, `${writer} has its own run`);
    assert.ok((w[0]?.cost_usd ?? 0) > 0, `${writer}'s cost is on its run`);
  }
  const events = await store.events({ table: "studio_cards" });
  assert.equal(events.length, cards.length);
});

test("the strategist stops at the cap and says so", async () => {
  const store = new MemoryStore();
  const transport = new FakeTransport();
  const run = await store.startRun({ agent: "writer-en", trigger: "manual" });
  await store.finishRun(run.id, { outcome: "ok", costUsd: 11 });
  const result = await runStrategist(context(store, transport, new Date()));
  assert.equal(result.outcome, "capped");
  assert.equal(transport.calls.length, 0);
});
