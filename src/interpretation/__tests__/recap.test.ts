/**
 * The recap pass: what the recap writer reads, and how its sections are
 * placed on top of the reading (or how a failure stays visible).
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  RECAP_EFFORT,
  RECAP_MODEL,
  buildRecapUserPrompt,
  withRecap,
  type AiSection,
} from "../reading-pipeline";

const READING: AiSection[] = [
  { heading: "What was there before you", paragraphs: ["Saturn in the 12th…", "**You are at dinner when…**"], pullQuote: "Later is not never." },
  { heading: "Speaking too soon", paragraphs: ["Mercury stands still…"] },
];

const RECAP: AiSection[] = [
  { heading: "Recap", paragraphs: ["The pattern…"] },
  { heading: "Your strengths", paragraphs: ["**Quiet discipline.** Saturn…"] },
  { heading: "Your challenges", paragraphs: ["**Speaking early.** Mercury…"] },
  { heading: "How to use your strengths", paragraphs: ["**Quiet discipline.** Block…"] },
  { heading: "Solutions to your challenges", paragraphs: ["**Speaking early.** Share results…"] },
];

test("the recap is written by Fable 5.1 at extra-high effort", () => {
  assert.equal(RECAP_MODEL, "claude-fable-5-1");
  assert.equal(RECAP_EFFORT, "xhigh");
});

test("the recap writer reads the whole finished reading in the output language", () => {
  const prompt = buildRecapUserPrompt("Proxima", "Blockages & Repeating Patterns", "fr", READING);
  assert.match(prompt, /Reading: Blockages & Repeating Patterns/);
  assert.match(prompt, /in French/);
  for (const section of READING) {
    assert.ok(prompt.includes(`## ${section.heading}`), section.heading);
    for (const paragraph of section.paragraphs) assert.ok(prompt.includes(paragraph), paragraph);
  }
  assert.ok(prompt.includes("> Later is not never."));
});

test("five recap sections go on top of the reading, unchanged", () => {
  const sections = withRecap(READING, { status: "ok", sections: RECAP, model: "claude-fable-5-1" });
  assert.deepEqual(sections.map((s) => s.heading), [...RECAP, ...READING].map((s) => s.heading));
});

test("a failed or malformed recap keeps the reading and says why at the top", () => {
  const refused = withRecap(READING, { status: "refused", message: "declined" });
  assert.equal(refused.length, READING.length + 1);
  assert.equal(refused[0].heading, "Recap");
  assert.match(refused[0].paragraphs[0], /could not be written this time \(declined\)/);
  assert.deepEqual(refused.slice(1), READING);

  const short = withRecap(READING, { status: "ok", sections: RECAP.slice(0, 3), model: "m" });
  assert.match(short[0].paragraphs[0], /expected 5 recap sections, got 3/);

  const noKey = withRecap(READING, { status: "no_api_key" });
  assert.match(noKey[0].paragraphs[0], /no API key configured/);
});
