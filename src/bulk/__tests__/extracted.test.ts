import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeDate, normalizeTime, parseExtraction } from "../extracted";

test("dates and times are normalised or emptied", () => {
  assert.equal(normalizeDate("1997-1-2"), "1997-01-02");
  assert.equal(normalizeDate("1997-02-30"), "");
  assert.equal(normalizeDate("02/01/1997"), "");
  assert.equal(normalizeTime("17:15"), "17:15");
  assert.equal(normalizeTime("5h15"), "05:15");
  assert.equal(normalizeTime("5:15 pm"), "17:15");
  assert.equal(normalizeTime("12:30 am"), "00:30");
  assert.equal(normalizeTime("25:00"), "");
  assert.equal(normalizeTime(""), "");
});

test("the AI answer becomes clean rows, with doubts carried into notes", () => {
  const people = parseExtraction(
    JSON.stringify({
      people: [
        { firstName: "Joana", lastName: "Mehou", birthDate: "1997-01-02", birthTime: "17:15", birthPlace: "Bourg-la-Reine, France", notes: "", sources: ["IMG_1.jpg", "IMG_2.jpg", "IMG_1.jpg", ""] },
        { firstName: "Sam", lastName: "", birthDate: "1990-13-01", birthTime: "around noon", birthPlace: "Lyon", notes: "Blurry" },
        { firstName: "", lastName: "", birthDate: "", birthTime: "", birthPlace: "", notes: "" },
      ],
    }),
  );
  assert.equal(people.length, 2);
  assert.equal(people[0].birthTime, "17:15");
  assert.deepEqual(people[0].sources, ["IMG_1.jpg", "IMG_2.jpg"]);
  assert.deepEqual(people[1].sources, []);
  assert.equal(people[1].birthDate, "");
  assert.equal(people[1].birthTime, "");
  assert.match(people[1].notes, /Blurry/);
  assert.match(people[1].notes, /Date not understood/);
  assert.match(people[1].notes, /Time not understood/);
});
