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
  assert.equal(styleKey("anything"), "reading.style.conversational");
});

test("the blockages reading opens with the recap, pros and cons before the detail", () => {
  const text = defaultPrompts()["reading.deep.blockages-patterns"];
  const order = ["'Recap'", "'Your strengths'", "'Your challenges'", "'How to use your strengths'", "'Solutions to your challenges'"]
    .map((heading) => text.indexOf(heading));
  assert.ok(order.every((index) => index >= 0), "all five recap headings are asked for");
  assert.deepEqual([...order].sort((a, b) => a - b), order, "in this order");
  assert.match(text, /NO story/);
  assert.ok(text.indexOf("'Solutions to your challenges'") < text.indexOf("1. What was there before you"));
  assert.doesNotMatch(text, /At a glance —/);
});
