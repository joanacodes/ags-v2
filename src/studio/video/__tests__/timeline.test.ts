import { test } from "node:test";
import assert from "node:assert/strict";
import { buildTimeline, captionSegments, estimatedWords, scenesFor, toSrt, wordsFromAlignment } from "../timeline";
import { splitLines } from "../spec";

test("ElevenLabs' character timings become words", () => {
  const text = "Your Saturn, here.";
  const chars = [...text];
  const words = wordsFromAlignment({ characters: chars, character_start_times_seconds: chars.map((_, i) => i * 0.1), character_end_times_seconds: chars.map((_, i) => i * 0.1 + 0.08) });
  assert.deepEqual(words.map((w) => w.text), ["Your", "Saturn,", "here."]);
  assert.equal(words[1]!.start, 0.5);
  assert.equal(Math.round(words[1]!.end * 100) / 100, 1.18);
});

test("captions never split '7 in 10' or 'The Astro Study', and none is shorter than 0.6 s", () => {
  const words = estimatedWords("I picked mine 7 in 10 times at The Astro Study and you can too, comment TEST now", 150);
  const segs = captionSegments(words, 3);
  const texts = segs.map((s) => s.text);
  assert.ok(texts.some((t) => t.includes("7 in 10")), texts.join(" | "));
  assert.ok(texts.some((t) => t.includes("The Astro Study")), texts.join(" | "));
  for (const s of segs.slice(0, -1)) assert.ok(s.end - s.start >= 0.6, `${s.text}: ${s.end - s.start}`);
  // Continuous: each caption ends where the next starts.
  for (let i = 0; i < segs.length - 1; i += 1) assert.equal(segs[i]!.end, segs[i + 1]!.start);
});

test("the hook holds three seconds, the disclosure the last second", () => {
  const script = "Birth chart, Saturn. Saturn shows where duty arrived early. It is a strength. Comment TEST.";
  const words = estimatedWords(script, 150);
  const lines = ["Birth chart, Saturn.", "Saturn shows where duty arrived early.", "It is a strength.", "Comment TEST."];
  const t = buildTimeline(lines, words, { disclosure: true });
  const hook = t.scenes[0]!;
  assert.equal(hook.kind, "hook");
  assert.ok(hook.end >= 3, `hook ends at ${hook.end}`);
  const last = t.scenes[t.scenes.length - 1]!;
  assert.equal(last.kind, "disclosure");
  assert.equal(Math.round((last.end - last.start) * 1000), 1000);
  assert.equal(last.end, t.duration);
  for (let i = 1; i < t.scenes.length; i += 1) assert.ok(t.scenes[i]!.start >= t.scenes[i - 1]!.end - 1e-9);
});

test("scenes find a line's first word in the voice, or fall back to its share", () => {
  const words = estimatedWords("one two three four five six seven eight", 60);
  const scenes = scenesFor(["one two", "five six", "totally different words"], words, 8, 9, false);
  assert.equal(scenes[1]!.text, "five six");
  assert.equal(scenes[1]!.start, 4);
});

test("SRT stamps and the line splitter", () => {
  assert.equal(toSrt([{ text: "Hello there", start: 0, end: 1.5 }]), "1\n00:00:00,000 --> 00:00:01,500\nHello there\n");
  const lines = splitLines("If you were the responsible one at nine years old, this is probably why. Saturn shows where duty arrived early.");
  assert.ok(lines.every((l) => l.split(" ").length <= 8), lines.join(" | "));
  assert.equal(lines[0], "If you were the responsible one");
});
