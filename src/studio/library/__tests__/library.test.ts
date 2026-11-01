import { test } from "node:test";
import assert from "node:assert/strict";
import { entitiesIn, libraryEntries, librarySectionFor, notInherentHits } from "../library";
import { STANDING_RULES } from "../rules";

test("the library is read from AGS's definition library", () => {
  const lib = libraryEntries();
  assert.ok(lib.get("signs/scorpio")?.notInherent.includes("vengefulness"));
  assert.ok(lib.get("aspects/trine")?.notInherent.includes("luck"));
  assert.ok(lib.get("houses/house_8")?.notInherent.includes("death"));
  assert.match(lib.get("aspects/trine")?.definition ?? "", /facilitative flow/);
  // every kind the Studio names is there: ten planets, twelve signs, twelve houses
  for (const kind of ["planets", "signs", "houses"]) assert.ok([...lib.keys()].filter((k) => k.startsWith(`${kind}/`)).length >= 10, kind);
});

test("entities are found by name, in English and in French", () => {
  const en = entitiesIn("Venus trine Mars, from the 8th house, and two Scorpios.", "en").map((e) => e.id);
  for (const id of ["planets/venus", "aspects/trine", "planets/mars", "houses/house_8", "signs/scorpio"]) assert.ok(en.includes(id), id);
  const fr = entitiesIn("Vénus en Scorpion dans la maison 8.", "fr").map((e) => e.id);
  for (const id of ["planets/venus", "signs/scorpio", "houses/house_8"]) assert.ok(fr.includes(id), id);
  // an ordinary word is not a sign
  assert.deepEqual(entitiesIn("un lion dans la savane, une balance de cuisine", "fr"), []);
});

test("a card's library section names what the card names", () => {
  const section = librarySectionFor("The trine between your Sun and Moon", ["en", "fr"]) ?? "";
  assert.match(section, /^Sun \(planet/m);
  assert.match(section, /^Trine \(aspect/m);
  assert.match(section, /not inherent, never write these as Trine's: .*luck/);
  assert.equal(librarySectionFor("A quiet morning with coffee.", ["en"]), null);
});

test("a quality the library rules out is caught, unless the sentence denies it", () => {
  assert.equal(notInherentHits("Scorpios are vengeful.", "en")[0]?.quality, "vengefulness");
  assert.deepEqual(notInherentHits("Scorpio is not vengeful.", "en"), []);
  assert.equal(notInherentHits("The 8th house is the house of death.", "en")[0]?.quality, "death");
  assert.equal(notInherentHits("A trine brings luck.", "en")[0]?.quality, "luck");
  assert.deepEqual(notInherentHits("A trine isn't luck.", "en"), []);
  assert.deepEqual(notInherentHits("Your Moon shows what you need to feel secure.", "en"), []);
});

test("the standing rules name the library, exact sources and modern tropical astrology", () => {
  assert.match(STANDING_RULES, /AGS's own definition library/);
  assert.match(STANDING_RULES, /Sources:/);
  assert.match(STANDING_RULES, /modern tropical astrology/);
});

test("only a negation next to the quality denies it", () => {
  assert.equal(notInherentHits("Scorpios are vengeful, and they never forget.", "en")[0]?.quality, "vengefulness");
  assert.deepEqual(notInherentHits("Vengefulness isn't part of Scorpio's meaning, and neither are jealousy, manipulation or secrecy.", "en"), []);
  assert.deepEqual(notInherentHits("It is not a house of death or catastrophe: transformation is not destruction, and depth is not obsession. The 8th house is about trust.", "en"), []);
  assert.deepEqual(notInherentHits("A trine isn't luck. Ease is not a guarantee, and flow is not passivity.", "en"), []);
});
