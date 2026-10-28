import { test } from "node:test";
import assert from "node:assert/strict";
import { checkText, astrologyTermIn, type GateInput } from "../text";
import { defaultKit } from "../../kit/load";

const kit = defaultKit();
const card = {
  hook: "If you were the responsible one at nine years old, this is probably why.",
  anchor: "Saturn",
  figures: [{ value: "7 in 10", label: "recognised their Saturn description", source: "the Study page, week 46", verified: true }],
};
const link = "https://astrostudy.co.uk/test/?src=tt";

function video(overrides: Partial<GateInput> = {}): GateInput {
  return {
    platform: "tiktok",
    format: "video",
    language: "en",
    script:
      "Birth chart, Saturn, and the nine-year-old who did the grown-up's job. Saturn's house shows where duty arrived early. It's a strength that took longer to learn, not a punishment. In my blind test, 7 in 10 people recognise this one. Comment TEST and see if you'd pick yours.",
    lines: ["The responsible one at nine?", "Saturn shows where duty", "arrived early.", "A strength learnt slowly."],
    caption: `Saturn in the birth chart, in plain words.\nLink in bio.\n${kit.disclosure.en}`,
    tags: ["#astrology", "#birthchart", "#saturnreturn"],
    disclosure: true,
    card,
    allowedLinks: [link],
    ...overrides,
  };
}

test("a good video passes every check", () => {
  const result = checkText(video(), kit);
  assert.deepEqual(result.failures, []);
  assert.equal(result.ok, true);
});

test("the kit's banned words, emoji and predictions are caught with their span", () => {
  const result = checkText(video({ caption: `The universe is shifting ✨ and you will meet someone.\n${kit.disclosure.en}` }), kit);
  const checks = result.failures.map((f) => f.check);
  assert.ok(checks.includes("extras"));
  assert.ok(checks.includes("emoji"));
  assert.ok(checks.includes("prediction"));
});

test("a figure that isn't on the card, or isn't verified, stops the piece", () => {
  const unverified = { ...card, figures: [{ ...card.figures[0]!, verified: false }] };
  assert.ok(checkText(video({ card: unverified }), kit).failures.some((f) => f.check === "figures"));
  const invented = checkText(video({ caption: `92% of people agree.\n${kit.disclosure.en}` }), kit);
  assert.ok(invented.failures.some((f) => f.check === "figures" && f.span === "92%"));
  // Luck's one in three needs no source: the test itself makes it true.
  assert.ok(!checkText(video({ caption: `Luck finds yours 1 in 3 times.\n${kit.disclosure.en}` }), kit).failures.some((f) => f.check === "figures"));
});

test("a voiced video without the disclosure line is refused", () => {
  const result = checkText(video({ caption: "Saturn in the birth chart." }), kit);
  assert.ok(result.failures.some((f) => f.check === "disclosure"));
});

test("the keyword must come in the first five words of a video", () => {
  const result = checkText(video({ script: `${"word ".repeat(10)}birth chart ${"more ".repeat(40)}` }), kit);
  assert.ok(result.failures.some((f) => f.check === "keyword"));
});

test("test statements stay blind, with AGS's own rule", () => {
  assert.equal(astrologyTermIn("You were the one who kept the house running.", "en"), null);
  assert.equal(astrologyTermIn("Your Saturn made you careful.", "en"), "Saturn");
  const result = checkText(video({ statements: ["You kept the house running.", "Your Moon is soft."] }), kit);
  assert.ok(result.failures.some((f) => f.check === "statements" && /Moon/.test(f.message)));
});

test("French pieces are in French and say vous", () => {
  const fr: GateInput = {
    platform: "threads",
    format: "text",
    language: "fr",
    caption: "Ton Saturne n’est pas une punition, c’est là où tu as appris tôt.",
    tags: ["Astrologie"],
    disclosure: false,
    card,
    allowedLinks: [],
  };
  const result = checkText(fr, kit);
  assert.ok(result.failures.some((f) => f.check === "french" && /vous/.test(f.message)));
  const english = checkText({ ...fr, caption: "Your Saturn is not your punishment, it is where you learnt early." }, kit);
  assert.ok(english.failures.some((f) => f.check === "french" && /reads as English/.test(f.message)));
  const good = checkText({ ...fr, caption: "Votre Saturne n’est pas une punition. C’est là où vous avez appris tôt, à la dure, et l’avez gardé." }, kit);
  assert.deepEqual(good.failures, []);
});

test("a link other than the piece's own is refused, and no-go subjects are caught", () => {
  const result = checkText(video({ caption: `See https://example.com/x for your child's chart.\n${kit.disclosure.en}` }), kit);
  assert.ok(result.failures.some((f) => f.check === "urls"));
  assert.ok(result.failures.some((f) => f.check === "nogo" && /children/.test(f.message)));
});

test("network lengths: X takes 280 characters, Threads one topic tag, a carousel 5 to 7 slides", () => {
  const x = checkText({ platform: "x", format: "text", language: "en", caption: "a".repeat(300), tags: [], disclosure: false, card, allowedLinks: [] }, kit);
  assert.ok(x.failures.some((f) => f.check === "length" && /280/.test(f.message)));
  const th = checkText({ platform: "threads", format: "text", language: "en", caption: "Your Saturn is not your punishment.", tags: ["Astrology", "Saturn"], disclosure: false, card, allowedLinks: [] }, kit);
  assert.ok(th.failures.some((f) => /topic tags/.test(f.message)));
  const carousel = checkText(
    { platform: "instagram", format: "carousel", language: "en", caption: "Saturn, in plain words.", tags: ["#a", "#b", "#c"], slides: [{ heading: "One", body: "two" }], disclosure: false, card, allowedLinks: [] },
    kit,
  );
  assert.ok(carousel.failures.some((f) => /slides/.test(f.message)));
});

test("the kit's good video examples pass the brand's checks", () => {
  for (const lang of ["en", "fr"] as const) {
    for (const ex of kit.examples["video"]?.[lang]?.good ?? []) {
      const script = typeof ex === "string" ? ex : ex.text;
      const result = checkText(
        {
          platform: lang === "en" ? "tiktok" : "instagram",
          format: "video",
          language: lang,
          script,
          caption: kit.disclosure[lang],
          tags: lang === "en" ? ["#astrology", "#birthchart", "#natalchart"] : ["#astrologie", "#thèmenatal", "#saturne"],
          disclosure: true,
          card: { hook: script.split(".")[0] ?? script, anchor: null, figures: [{ value: "7 times out of 10", label: "my own score", source: "my test", verified: true }, { value: "7 fois sur 10", label: "mon score", source: "mon test", verified: true }] },
          allowedLinks: [],
        },
        kit,
      );
      assert.deepEqual(result.failures, [], `${lang}: ${script.slice(0, 40)}`);
    }
  }
});
