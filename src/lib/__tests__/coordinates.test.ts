import assert from "node:assert/strict";
import { test } from "node:test";
import {
  decodePlusCode,
  isFullPlusCode,
  parseCoordinateInput,
  parseDegrees,
  recoverNearest,
} from "../coordinates";

const close = (a: number, b: number, tolerance = 1e-4) =>
  assert.ok(Math.abs(a - b) < tolerance, `${a} ≈ ${b}`);

test("full Plus Codes decode to the centre of their area", () => {
  // Open Location Code reference: 8FVC9G8F+6X is in Zürich.
  const zurich = decodePlusCode("8FVC9G8F+6X");
  close(zurich.latitude, 47.365562, 1e-3);
  close(zurich.longitude, 8.524813, 1e-3);
  const given = decodePlusCode("8J3Q3XM4+PV");
  assert.ok(given.latitude > 31 && given.latitude < 31.1, String(given.latitude));
  assert.ok(given.longitude > 75.9 && given.longitude < 76, String(given.longitude));
  assert.equal(isFullPlusCode("8J3Q3XM4+PV"), true);
  assert.equal(isFullPlusCode("8j3q3xm4+pv"), true);
  assert.equal(isFullPlusCode("3XM4+PV"), false);
});

test("short Plus Codes recover from a nearby reference point", () => {
  // Reference example from the Open Location Code spec.
  assert.equal(recoverNearest("9G8F+6X", { latitude: 47.4, longitude: 8.6 }), "8FVC9G8F+6X");
  const full = recoverNearest("3XM4+PV", decodePlusCode("8J3Q3XM4+PV"));
  assert.equal(full, "8J3Q3XM4+PV");
});

test("decimal degrees and degrees-minutes-seconds", () => {
  const paris = parseDegrees("48.8566, 2.3522");
  close(paris!.latitude, 48.8566);
  close(paris!.longitude, 2.3522);
  const sydney = parseDegrees("-33.8688 151.2093");
  close(sydney!.latitude, -33.8688);
  const dms = parseDegrees(`48°51'24"N 2°21'03"E`);
  close(dms!.latitude, 48.856667);
  close(dms!.longitude, 2.350833);
  const west = parseDegrees("40.7128 N, 74.0060 W");
  close(west!.longitude, -74.006);
  const europeanComma = parseDegrees("48,8566 2,3522");
  close(europeanComma!.latitude, 48.8566);
  assert.equal(parseDegrees("95, 10"), null);
  assert.equal(parseDegrees("10 Downing Street"), null);
});

test("the birth-place field recognises each kind, and leaves addresses alone", () => {
  assert.equal(parseCoordinateInput("8J3Q3XM4+PV").kind, "point");
  assert.equal(parseCoordinateInput("8J3Q3XM4+PV Cairo").kind, "point");
  const short = parseCoordinateInput("3XM4+PV, Port Said, Egypt");
  assert.deepEqual(short, { kind: "short-plus-code", code: "3XM4+PV", locality: "Port Said, Egypt" });
  assert.equal(parseCoordinateInput("48.8566, 2.3522").kind, "point");
  assert.equal(parseCoordinateInput("12 rue de Rivoli, Paris").kind, "none");
  assert.equal(parseCoordinateInput("Versailles").kind, "none");
});
