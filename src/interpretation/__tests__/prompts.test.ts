import assert from "node:assert/strict";
import { test } from "node:test";
import {
  PROMPT_KEYS,
  defaultPrompts,
  fillPlaceholders,
  isPromptKey,
  mergePrompts,
  styleKey,
} from "../prompts";

test("every prompt has a default and asks for bold real-life stories where it writes prose", () => {
  const prompts = defaultPrompts();
  for (const key of PROMPT_KEYS) assert.ok(prompts[key].length > 0, key);
  for (const key of ["reading.system", "interpretation.system", "temporal.instructions"] as const) {
    assert.match(prompts[key], /double\s+asterisks/, key);
  }
});

test("saved versions replace defaults; blank and unknown keys are ignored", () => {
  const merged = mergePrompts({ "reading.system": "Mine", "temporal.instructions": "  ", nope: "x" });
  assert.equal(merged["reading.system"], "Mine");
  assert.equal(merged["temporal.instructions"], defaultPrompts()["temporal.instructions"]);
  assert.equal(isPromptKey("nope"), false);
});

test("placeholders and style keys", () => {
  assert.equal(fillPlaceholders("Hi {{person}} in {{language}} {{other}}", { person: "Ana", language: "French" }),
    "Hi Ana in French {{other}}");
  assert.equal(styleKey("poetic"), "reading.style.poetic");
  assert.equal(styleKey("anything"), "reading.style.clinical");
});
