import { test } from "node:test";
import assert from "node:assert/strict";
import { mediaNeed } from "../render";
import { pictureJob, glyphFor } from "../../pictures/jobs";
import { pictures } from "../../pictures/templates";
import { buildSpec } from "../../video/spec";
import { defaultKit } from "../../kit/load";
import { StudioSettings } from "../../settings";

const card = { pillar: "placements" as const, hook: "Your Saturn is not your <punishment>.", anchor: "Saturn", figures: [], sky_date: null };

test("which pieces need media, and of which kind", () => {
  assert.equal(mediaNeed({ format: "video", platform: "tiktok" }), "video");
  assert.equal(mediaNeed({ format: "carousel", platform: "instagram" }), "picture");
  assert.equal(mediaNeed({ format: "text", platform: "bluesky" }), "picture");
  assert.equal(mediaNeed({ format: "text", platform: "threads" }), null);
  assert.equal(mediaNeed({ format: "issue", platform: "substack" }), null);
});

test("pictures escape what a model wrote and keep the platforms' sizes", () => {
  const job = pictureJob({ format: "text", platform: "bluesky", language: "en", slides: null, title: null, description: null, lines: null, caption: null }, card);
  assert.ok(job);
  assert.ok(job!.title!.includes("&lt;punishment&gt;"));
  const [still] = pictures(job!, { fonts: "/f/", media: "/m/" });
  assert.equal(still!.width, 1080);
  assert.equal(still!.height, 1080);
  const pin = pictureJob({ format: "pin", platform: "pinterest", language: "en", slides: null, title: "Saturn in the birth chart", description: "One. Two.", lines: null, caption: null }, card);
  assert.equal(pictures(pin!, { fonts: "/f/", media: "/m/" })[0]!.height, 1500);
  const slides = Array.from({ length: 6 }, (_, i) => ({ heading: `Slide ${i}`, body: "body" }));
  const carousel = pictureJob({ format: "carousel", platform: "instagram", language: "fr", slides, title: null, description: null, lines: null, caption: null }, card);
  const list = pictures(carousel!, { fonts: "/f/", media: "/m/" });
  assert.equal(list.length, 6);
  assert.ok(list[5]!.html.includes("astrostudy.co.uk/fr/test"));
  assert.equal(glyphFor("Saturne"), "♄");
});

test("a video's spec comes from its piece and the owner's video settings", () => {
  const settings = new StudioSettings({ "render-video": { voice_id: "v1", background_speed: 0.7 } });
  const spec = buildSpec({ script: "Birth chart, Saturn. A strength learnt slowly.", lines: null, language: "en", spec: { template: "placement-callout" } }, card, defaultKit(), settings.get("render-video"));
  assert.equal(spec.template, "placement-callout");
  assert.equal(spec.voice.voice_id, "v1");
  assert.equal(spec.background.speed, 0.7);
  assert.ok(spec.lines.length >= 2);
  assert.equal(spec.disclosure_text, "AI voice · words by Joana");
});
