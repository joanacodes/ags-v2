import { test } from "node:test";
import assert from "node:assert/strict";
import { checkText, ALL_CHECKS, type GateCheck, type GateChecks, type GateInput } from "../text";
import { defaultKit } from "../../kit/load";

const kit = defaultKit();
const only = (check: GateCheck): GateChecks => ({ ...Object.fromEntries(Object.keys(ALL_CHECKS).map((k) => [k, false])), [check]: true }) as GateChecks;
const piece = (caption: string, language: "en" | "fr" = "en"): GateInput => ({
  platform: "threads",
  format: "text",
  language,
  caption,
  disclosure: false,
  card: { hook: "Why is Scorpio a scorpion?", figures: [], anchor: "Scorpio" },
  allowedLinks: [],
});
const fails = (caption: string, check: GateCheck, language: "en" | "fr" = "en") => checkText(piece(caption, language), kit, only(check)).failures.some((f) => f.check === check);

test("library: a meaning the library rules out stops the piece", () => {
  assert.ok(fails("Scorpios are vengeful, and they never forget.", "library"));
  assert.ok(!fails("Scorpio is not vengeful: it looks beneath the surface for the truth.", "library"));
  assert.ok(fails("The 8th house is the house of death.", "library"));
});

test("sources: a myth needs its exact references", () => {
  assert.ok(fails("In Greek myth, Gaia sends a scorpion to stop Orion.", "sources"));
  assert.ok(fails("In Greek myth, Gaia sends a scorpion to stop Orion.\nSources: Greek mythology", "sources"));
  assert.ok(!fails("In Greek myth, Gaia sends a scorpion to stop Orion.\nSources: Pseudo-Eratosthenes, Catasterismi 7 and 32", "sources"));
  assert.ok(!fails("Mars rules Scorpio in traditional astrology (Ptolemy, Tetrabiblos I.17).", "sources"));
  assert.ok(fails("Dans la mythologie grecque, Gaïa envoie un scorpion contre Orion.", "sources", "fr"));
  assert.ok(!fails("Dans la mythologie grecque, Gaïa envoie un scorpion contre Orion.\nSources : Pseudo-Ératosthène, Catastérismes 32", "sources", "fr"));
  assert.ok(!fails("Your Moon shows what you need to feel secure.", "sources"));
  // "myth" as a misconception is not mythology
  assert.ok(!fails("Common myth: Scorpios are vengeful. Not quite. #astrologymyths", "sources"));
  assert.ok(fails("The myth behind the sign: Orion and the scorpion.", "sources"));
});

test("terms: never \"modern astrology\" on its own", () => {
  assert.ok(fails("In modern astrology, Pluto rules Scorpio.", "terms"));
  assert.ok(!fails("In modern tropical astrology, Pluto rules Scorpio.", "terms"));
  assert.ok(fails("En astrologie moderne, Pluton gouverne le Scorpion.", "terms", "fr"));
  assert.ok(!fails("En astrologie tropicale moderne, Pluton gouverne le Scorpion.", "terms", "fr"));
});
