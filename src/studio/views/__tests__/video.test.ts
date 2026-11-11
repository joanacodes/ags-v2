import { test } from "node:test";
import assert from "node:assert/strict";
import { MemoryStore, MemoryStorage } from "../../store/memory";
import { defaultKit } from "../../kit/load";
import { StudioSettings } from "../../settings";
import { FakeTransport } from "../../agents/__tests__/fake-transport";
import { videoState } from "../video";
import type { AgentContext } from "../../agents/context";

function context(): AgentContext {
  return { store: new MemoryStore(), storage: new MemoryStorage(), transport: new FakeTransport(), kit: defaultKit(), kitVersion: 1, settings: new StudioSettings({}), now: new Date("2026-11-11T12:00:00Z"), trigger: "manual", ownerId: "owner-1", dryRun: true };
}

test("the Video studio opens without a piece: the kit's first hook is the starting script", async () => {
  const ctx = context();
  const state = await videoState(ctx, null);
  assert.equal(state.pieceId, null);
  assert.equal(state.spec.script, ctx.kit.hooks.en[0]?.text);
  assert.ok(state.spec.lines.length > 0, "the script is split into on-screen lines");
  assert.ok(state.timeline.duration > 0, "the preview has a timeline");
});
