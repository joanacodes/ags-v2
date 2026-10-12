import assert from "node:assert/strict";
import { test } from "node:test";
import {
  AI_MODELS,
  anthropicHeaders,
  DEFAULT_AI_MODEL,
  isAiModelId,
  modelRequestFields,
  readMessagesResponse,
  resolveAiModel,
} from "../ai-models";

test("offers Sonnet 5.5, Opus 5.5 and Fable 5.1, with Sonnet 5.5 as default", () => {
  assert.deepEqual(
    AI_MODELS.map((m) => m.id),
    ["claude-sonnet-5-5", "claude-opus-5-5", "claude-fable-5-1"],
  );
  assert.equal(DEFAULT_AI_MODEL, "claude-sonnet-5-5");
});

test("charts without a valid stored model fall back to the default", () => {
  assert.equal(resolveAiModel(undefined), "claude-sonnet-5-5");
  assert.equal(resolveAiModel("claude-sonnet-4-6"), "claude-sonnet-5-5");
  assert.equal(resolveAiModel("claude-fable-5-1"), "claude-fable-5-1");
  assert.equal(isAiModelId("claude-opus-5-5"), true);
  assert.equal(isAiModelId(42), false);
});

test("the fallback model is only requested after the user agreed", () => {
  const fields = modelRequestFields("claude-opus-5-5");
  assert.equal(fields.model, "claude-opus-5-5");
  assert.equal(fields.fallbacks, undefined);
  assert.equal(anthropicHeaders("k")["anthropic-beta"], undefined);
  assert.equal(modelRequestFields("claude-opus-5-5", true).fallbacks, "default");
  assert.equal(anthropicHeaders("k", true)["anthropic-beta"], "server-side-fallback-2026-07-01");
});

test("response reader keeps text, reports the serving model, and surfaces refusals", () => {
  const ok = readMessagesResponse(
    {
      model: "claude-opus-4-8",
      stop_reason: "end_turn",
      content: [{ type: "thinking" }, { type: "text", text: "Hello" }],
    },
    "claude-opus-5-5",
  );
  assert.deepEqual(ok, { ok: true, text: "Hello", model: "claude-opus-4-8" });
  const refused = readMessagesResponse({ stop_reason: "refusal", content: [] }, "claude-sonnet-5-5");
  assert.equal(refused.ok, false);
  assert.equal(!refused.ok && refused.refused, true);
});
