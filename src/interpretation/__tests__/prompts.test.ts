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

test("the recap prompt asks for five sections in order, grounded in the finished reading", () => {
  const text = defaultPrompts()["reading.recap"];
  const order = ["'Recap'", "'Your strengths'", "'Your challenges'", "'How to use your strengths'", "'Solutions to your challenges'"]
    .map((heading) => text.indexOf(heading));
  assert.ok(order.every((index) => index >= 0), "all five recap headings are asked for");
  assert.deepEqual([...order].sort((a, b) => a - b), order, "in this order");
  assert.match(text, /already\s+finished/);
  assert.match(text, /only what the reading says/);
  assert.match(text, /No stories/);
});

test("the blockages reading leaves the summary to the recap pass", () => {
  const text = defaultPrompts()["reading.deep.blockages-patterns"];
  assert.match(text, /NO 'At a glance'/);
  assert.doesNotMatch(text, /'Your strengths'/);
  assert.ok(text.indexOf("1. What was there before you") > 0);
});
