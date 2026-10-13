import assert from "node:assert/strict";
import { test } from "node:test";
import { PARIS, altAz, galacticToEquatorial, julianDate, localSiderealDegrees, projectDome, starRadius } from "../sky";

const near = (actual: number, expected: number, tolerance: number) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} is not within ${tolerance} of ${expected}`);

test("Julian date and sidereal time at J2000", () => {
  const j2000 = new Date(Date.UTC(2000, 0, 1, 12, 0, 0));
  near(julianDate(j2000), 2_451_545.0, 1e-9);
  // GMST at J2000.0 is 18h41m50.5s = 280.4606°.
  near(localSiderealDegrees(j2000, 0), 280.4606, 0.001);
  near(localSiderealDegrees(j2000, PARIS.longitude), 282.8128, 0.001);
});

test("a star at the meridian passes at 90° minus its distance from the zenith", () => {
  const lst = 100;
  near(altAz(lst, PARIS.latitude, PARIS.latitude, lst).alt, 90, 1e-9);
  // Sirius (dec −16.72°) culminating over Paris: 90 − 48.86 − 16.72 = 24.42°.
  const sirius = altAz(lst, -16.72, PARIS.latitude, lst);
  near(sirius.alt, 24.4234, 1e-3);
  near(sirius.az, 180, 1e-6);
});

test("Polaris stays at Paris's latitude, due north, all night", () => {
  for (const lst of [0, 90, 180, 270]) {
    const polaris = altAz(37.95, 89.26, PARIS.latitude, lst);
    near(polaris.alt, PARIS.latitude, 0.8);
    assert.ok(polaris.az < 1.5 || polaris.az > 358.5, `azimuth ${polaris.az}`);
  }
});

test("the dome projection: zenith in the centre, horizon on the circle, north up, east left", () => {
  assert.deepEqual(projectDome(90, 0, 200, 300, 100), { x: 200, y: 300 });
  const north = projectDome(0, 0, 200, 300, 100);
  near(north.x, 200, 1e-9);
  near(north.y, 200, 1e-9);
  const east = projectDome(0, 90, 200, 300, 100);
  near(east.x, 100, 1e-9);
  near(east.y, 300, 1e-9);
});

test("brighter stars are drawn bigger", () => {
  assert.ok(starRadius(-1.4) > starRadius(1) && starRadius(1) > starRadius(5));
  assert.ok(starRadius(9) >= 0.45);
});

test("galactic coordinates: the centre of the Milky Way is in Sagittarius, its pole in Coma Berenices", () => {
  const centre = galacticToEquatorial(0, 0);
  near(centre.ra, 266.405, 0.01);
  near(centre.dec, -28.936, 0.01);
  const pole = galacticToEquatorial(123, 90);
  near(pole.ra, 192.859, 0.01);
  near(pole.dec, 27.128, 0.01);
});
