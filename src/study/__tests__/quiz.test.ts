import assert from "node:assert/strict";
import { test } from "node:test";
import {
  QUESTIONS_PER_LENGTH,
  STUDY_AREAS,
  STUDY_CITIES,
  anchorKey,
  anchorNeedsTime,
  arrangeOptions,
  checkStatement,
  chooseDecoys,
  dayIn,
  dayStartIn,
  fakeBirth,
  hashString,
  isAdultOn,
  planQuiz,
  promptVersion,
  scoreAnswers,
  seededRandom,
  shuffled,
  wordCount,
  type DecoyCandidate,
} from "../quiz";
import { READING_DOMAINS } from "../../interpretation/domains";
import type { Chart } from "../../types";

const everything = (): boolean => true;

function chartFixture(timeKnown: boolean): Chart {
  return {
    id: "chart-test",
    person: { id: "p", firstName: "Sam", lastName: "" },
    birth: {
      date: "1990-03-14",
      time: timeKnown ? "08:30" : undefined,
      timeKnown,
      place: "Paris",
      country: "France",
      timezone: "Europe/Paris",
      utcOffset: "UTC +1:00",
      latitude: 48.8566,
      longitude: 2.3522,
    },
    configuration: { houseSystem: "Placidus", zodiac: "Tropical", ephemeris: "Swiss Ephemeris" },
    planets: [
      { planet: "Venus", sign: "Libra", degree: 3, minute: 0, house: 7 },
      { planet: "Sun", sign: "Pisces", degree: 23, minute: 10, house: 12 },
    ],
    points: [{ point: "Chiron", sign: "Cancer", degree: 10, minute: 0, house: 4 }],
    houses: [{ number: 7, sign: "Aries", degree: 1, minute: 0 }],
    angles: [{ point: "ASC", sign: "Libra", degree: 1, minute: 0 }],
    aspects: [],
    summary: {
      sun: { degree: 0, minute: 0, sign: "Pisces", house: 12 },
      moon: { degree: 0, minute: 0, sign: "Aries", house: 1 },
      ascendant: { degree: 0, minute: 0, sign: "Libra" },
      chartRuler: { planet: "Venus", position: "" },
      dominantElement: "Air",
      dominantModality: "Cardinal",
      dominantPlanets: [],
      strongestHouses: [],
      majorThemes: [],
      insights: [],
    },
    status: "active",
    favourite: false,
    confidenceScore: 0,
    createdAt: "",
    lastOpenedAt: "",
    lastOpenedLabel: "",
  };
}

/* ------------------------------- configuration ------------------------------- */

test("the areas are the ten reading domains other than the summary, each with a question in both languages", () => {
  const domains = READING_DOMAINS.map((d) => d.slug).filter((s) => s !== "summary");
  assert.deepEqual(STUDY_AREAS.map((a) => a.slug).sort(), [...domains].sort());
  for (const area of STUDY_AREAS) {
    assert.ok(area.anchors.length >= 2, `${area.slug} needs two anchors for long tests`);
    assert.ok(area.anchors.some((a) => !anchorNeedsTime(a)), `${area.slug} needs an anchor that works without a birth time`);
    assert.ok(area.question.en.length > 0 && area.question.fr.length > 0);
  }
  assert.deepEqual(QUESTIONS_PER_LENGTH, { short: 5, medium: 10, long: 20 });
});

/* --------------------------------- chance --------------------------------- */

test("the same seed draws the same numbers; shuffling keeps every item", () => {
  const a = seededRandom("seed-1");
  const b = seededRandom("seed-1");
  for (let i = 0; i < 5; i += 1) assert.equal(a(), b());
  assert.notEqual(seededRandom("seed-1")(), seededRandom("seed-2")());
  const items = [1, 2, 3, 4, 5, 6];
  assert.deepEqual([...shuffled(items, seededRandom("x"))].sort(), items);
  assert.deepEqual(items, [1, 2, 3, 4, 5, 6]);
  assert.equal(hashString("abc"), hashString("abc"));
  assert.match(promptVersion("prompt"), /^[0-9a-f]{8}$/);
});

/* ---------------------------------- plans ---------------------------------- */

test("a medium quiz asks every area once, a short one five areas, a long one each area twice", () => {
  const medium = planQuiz("medium", everything, seededRandom("m"));
  assert.equal(medium.items.length, 10);
  assert.equal(new Set(medium.items.map((i) => i.area)).size, 10);

  const short = planQuiz("short", everything, seededRandom("s"));
  assert.equal(short.items.length, 5);
  assert.equal(new Set(short.items.map((i) => i.area)).size, 5);

  const long = planQuiz("long", everything, seededRandom("l"));
  assert.ok(long.items.length >= 18 && long.items.length <= 20);
  const perArea = new Map<string, number>();
  for (const item of long.items) perArea.set(item.area, (perArea.get(item.area) ?? 0) + 1);
  for (const count of perArea.values()) assert.ok(count <= 2);
});

test("no anchor is asked twice, spares are new, and the same seed gives the same quiz", () => {
  for (const length of ["short", "medium", "long"] as const) {
    const plan = planQuiz(length, everything, seededRandom("same"));
    const anchors = [...plan.items, ...plan.spares].map((i) => i.anchor);
    assert.equal(new Set(anchors).size, anchors.length, `${length}: an anchor repeats`);
    assert.deepEqual(planQuiz(length, everything, seededRandom("same")), plan);
  }
});

test("without a birth time, no question uses an angle or a house", () => {
  const plan = planQuiz("long", (anchor) => !anchorNeedsTime(anchor), seededRandom("untimed"));
  assert.ok(plan.items.length > 0);
  for (const item of [...plan.items, ...plan.spares]) assert.equal(anchorNeedsTime(item.anchor), false, item.anchor);
});

/* --------------------------------- anchors --------------------------------- */

test("an anchor's key is the sign it sits in", () => {
  const chart = chartFixture(true);
  assert.equal(anchorKey(chart, "Venus"), "Venus:Libra");
  assert.equal(anchorKey(chart, "Chiron"), "Chiron:Cancer");
  assert.equal(anchorKey(chart, "H7"), "H7:Aries");
  assert.equal(anchorKey(chart, "ASC"), "ASC:Libra");
  assert.equal(anchorKey(chart, "Mars"), null);
  assert.equal(anchorNeedsTime("H11"), true);
  assert.equal(anchorNeedsTime("MC"), true);
  assert.equal(anchorNeedsTime("North Node"), false);
});

/* -------------------------------- statements -------------------------------- */

test("a plain statement passes; a named placement or a technical word does not", () => {
  const plain = "You notice the mood of a room before anyone speaks, and you adjust to it so quickly that people rarely see the effort.";
  assert.equal(checkStatement(plain, "en").ok, true);
  const named = "You love the way Venus does, with grace and a strong need for harmony in everything you share with people.";
  assert.deepEqual(checkStatement(named, "en"), { ok: false, reason: "astrology_term", detail: "Venus" });
  const technical = "Your 10th house makes you want a role where people can see the work you do and the effort it takes.";
  assert.equal(checkStatement(technical, "en").ok, false);
  assert.equal(checkStatement("Too short to judge.", "en").ok, false);
  assert.equal(checkStatement(`${"word ".repeat(40)}`.trim(), "en").ok, false);
});

test("French ordinary words that share a sign's spelling pass; the capitalised name does not", () => {
  const ordinary = "Vous cherchez la balance entre ce que vous donnez et ce que vous recevez, et un déséquilibre vous pèse vite.";
  assert.equal(checkStatement(ordinary, "fr").ok, true);
  const named = "Comme une vraie Balance, vous cherchez l’équilibre entre ce que vous donnez et ce que vous recevez chaque jour.";
  assert.equal(checkStatement(named, "fr").ok, false);
  const house = "Votre maison 4 vous pousse à vouloir un foyer calme, où chacun a sa place et où rien ne change trop vite.";
  assert.equal(checkStatement(house, "fr").ok, false);
  assert.equal(wordCount("  un  deux trois "), 3);
});

/* ------------------------------- wrong answers ------------------------------- */

const pool: DecoyCandidate[] = [
  { id: "d1", key: "Venus:Libra", text: "same placement as the participant", words: 20 },
  { id: "d2", key: "Venus:Aries", text: "aries one", words: 21 },
  { id: "d3", key: "Venus:Aries", text: "aries two", words: 20 },
  { id: "d4", key: "Venus:Taurus", text: "taurus", words: 19 },
  { id: "d5", key: "Venus:Pisces", text: "far too long", words: 60 },
];

test("wrong answers never share the participant's placement, repeat in a quiz, or both come from one placement", () => {
  for (const seed of ["a", "b", "c", "d", "e"]) {
    const pair = chooseDecoys(pool, "Venus:Libra", 20, new Set(), seededRandom(seed));
    assert.ok(pair !== null);
    const [first, second] = pair;
    assert.notEqual(first.key, "Venus:Libra");
    assert.notEqual(second.key, "Venus:Libra");
    assert.notEqual(first.id, second.id);
    assert.notEqual(first.key, second.key);
    assert.notEqual(first.id, "d5");
    assert.notEqual(second.id, "d5");
  }
  const used = chooseDecoys(pool, "Venus:Libra", 20, new Set(["d2", "d3", "d4"]), seededRandom("u"));
  assert.equal(used, null);
  assert.deepEqual(
    chooseDecoys(pool, "Venus:Libra", 20, new Set(), seededRandom("same")),
    chooseDecoys(pool, "Venus:Libra", 20, new Set(), seededRandom("same")),
  );
});

test("when nothing is close in length, the closest stand in", () => {
  const far: DecoyCandidate[] = [
    { id: "x1", key: "Mars:Leo", text: "a", words: 40 },
    { id: "x2", key: "Mars:Virgo", text: "b", words: 50 },
    { id: "x3", key: "Mars:Libra", text: "c", words: 70 },
  ];
  const pair = chooseDecoys(far, "Mars:Aries", 20, new Set(), seededRandom("far"));
  assert.ok(pair !== null);
  assert.deepEqual(pair.map((d) => d.id).sort(), ["x1", "x2"]);
});

test("the options keep the participant's own statement findable only through the stored answer", () => {
  const decoys = [pool[1], pool[3]] as unknown as readonly [DecoyCandidate, DecoyCandidate];
  const { options, correct } = arrangeOptions("mine", decoys, seededRandom("arr"));
  assert.deepEqual(options.map((o) => o.key), ["A", "B", "C"]);
  assert.equal(options.find((o) => o.key === correct)?.text, "mine");
  assert.deepEqual(arrangeOptions("mine", decoys, seededRandom("arr")), { options, correct });
});

/* ---------------------------------- score ---------------------------------- */

test("the score counts answered questions only", () => {
  assert.deepEqual(scoreAnswers([]), { answered: 0, recognised: 0, percent: 0 });
  assert.deepEqual(
    scoreAnswers([
      { answer: "A", correct: "A" },
      { answer: "B", correct: "C" },
      { answer: "C", correct: "C" },
      { answer: null, correct: "B" },
    ]),
    { answered: 3, recognised: 2, percent: 67 },
  );
});

/* ---------------------------------- dates ---------------------------------- */

test("the Paris day starts at local midnight, summer and winter", () => {
  assert.equal(dayStartIn(new Date("2026-10-26T10:00:00Z"), "Europe/Paris").toISOString(), "2026-10-25T23:00:00.000Z");
  assert.equal(dayStartIn(new Date("2026-07-01T10:00:00Z"), "Europe/Paris").toISOString(), "2026-06-30T22:00:00.000Z");
  // 25 October, the clocks went back at 3am: that day began at midnight summer time.
  assert.equal(dayStartIn(new Date("2026-10-25T22:30:00Z"), "Europe/Paris").toISOString(), "2026-10-24T22:00:00.000Z");
  assert.equal(dayIn(new Date("2026-10-25T23:30:00Z"), "Europe/Paris"), "2026-10-26");
});

test("18 on the day counts by the calendar", () => {
  assert.equal(isAdultOn("2008-10-26", "2026-10-26"), true);
  assert.equal(isAdultOn("2008-10-27", "2026-10-26"), false);
  assert.equal(isAdultOn("1990-03-14", "2026-10-26"), true);
  assert.equal(isAdultOn("not a date", "2026-10-26"), false);
});

/* -------------------------------- fake charts -------------------------------- */

test("fake birth details stay within 1950–2007, any minute, a listed city, the same for the same seed", () => {
  const random = seededRandom("fake");
  for (let i = 0; i < 200; i += 1) {
    const birth = fakeBirth(random);
    assert.ok(birth.date >= "1950-01-01" && birth.date <= "2007-12-31", birth.date);
    assert.match(birth.time, /^([01]\d|2[0-3]):[0-5]\d$/);
    assert.ok(STUDY_CITIES.includes(birth.city));
  }
  assert.deepEqual(fakeBirth(seededRandom("one")), fakeBirth(seededRandom("one")));
});
