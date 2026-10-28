import { test } from "node:test";
import assert from "node:assert/strict";
import { defaultKit, parseKit, pillarShares, slotsFor, testLink } from "../load";
import { DEFAULT_KIT_YAML } from "../default-kit";

test("the repository's kit is valid and its shares add up to 100", () => {
  const result = parseKit(DEFAULT_KIT_YAML);
  assert.equal(result.ok, true, result.ok ? "" : JSON.stringify(result.problems));
  const kit = defaultKit();
  const shares = pillarShares(kit);
  assert.equal(shares.test + shares.placements + shares.tested + shares.sky, 100);
  assert.equal(shares.test, 40);
});

test("the kit carries twenty hooks in each language", () => {
  const kit = defaultKit();
  assert.equal(kit.hooks.en.length, 20);
  assert.equal(kit.hooks.fr.length, 20);
});

test("slots resolve per format, and the test link carries the platform's src tag", () => {
  const kit = defaultKit();
  assert.deepEqual(slotsFor(kit, "instagram", "carousel"), ["13:00"]);
  assert.deepEqual(slotsFor(kit, "threads", "text"), ["09:00", "13:00", "20:00"]);
  assert.equal(testLink(kit, "fr", "threads"), "https://astrostudy.co.uk/fr/test/?src=th");
});

test("a kit whose shares don't add up is refused with the place of the problem", () => {
  const broken = DEFAULT_KIT_YAML.replace("share: 40\n    name: The test", "share: 45\n    name: The test");
  const result = parseKit(broken);
  assert.equal(result.ok, false);
  assert.ok(result.problems.some((p) => p.path === "pillars" && /105/.test(p.message)));
});

test("a YAML error is reported, not thrown", () => {
  const result = parseKit("brand: [unclosed");
  assert.equal(result.ok, false);
  assert.equal(result.problems[0]?.path, "(file)");
});
