import { test } from "node:test";
import assert from "node:assert/strict";
import * as A from "astronomy-engine";
import { houses, houseOf } from "../houses";
import { delta, longitude, sunAt, trueNode } from "../sky";
import { episodes, sampleTimes, DAY } from "../scan";
import { birthMoment, natalOf } from "../natal";
import { profections, releasing } from "../timelords";
import { buildForecast } from "../index";
import charts from "../../data/sample-charts.json";
import type { Chart } from "../../types";

const sample = (charts as unknown as { charts: Chart[] }).charts;

// an ecliptic point's altitude and azimuth, from astronomy-engine's own horizon maths
function horizonOf(lon: number, date: Date, lat: number, lng: number) {
  const t = A.MakeTime(date);
  const e = (A.e_tilt(t).tobl * Math.PI) / 180;
  const l = (lon * Math.PI) / 180;
  const ra = ((Math.atan2(Math.sin(l) * Math.cos(e), Math.cos(l)) * 180) / Math.PI / 15 + 24) % 24;
  const dec = (Math.asin(Math.sin(e) * Math.sin(l)) * 180) / Math.PI;
  return A.Horizon(t, new A.Observer(lat, lng, 0), ra, dec);
}

test("the Ascendant rises on the eastern horizon and the Midheaven sits on the meridian", () => {
  for (const [date, lat, lng] of [[new Date("1994-10-12T13:35:00Z"), 51.5074, -0.1278], [new Date("1988-03-03T04:10:00Z"), -33.87, 151.21], [new Date("2001-07-21T22:45:00Z"), 40.71, -74.01]] as const) {
    const h = houses(date, lat, lng);
    const asc = horizonOf(h.asc, date, lat, lng);
    const mc = horizonOf(h.mc, date, lat, lng);
    assert.ok(Math.abs(asc.altitude) < 0.01, `ASC altitude ${asc.altitude}`);
    assert.ok(asc.azimuth > 0 && asc.azimuth < 180, `ASC azimuth ${asc.azimuth}`);
    assert.ok(Math.abs(Math.abs(mc.azimuth - 180) % 180) < 0.05 || Math.abs(mc.azimuth) < 0.05, `MC azimuth ${mc.azimuth}`);
    assert.equal(h.system, "Placidus");
    assert.equal(houseOf(h.asc + 0.1, h.cusps), 1);
    assert.equal(houseOf(h.mc + 0.1, h.cusps), 10);
  }
});

test("positions are of date: the new moon of 9 November 2026 is a conjunction at 16°53′ Scorpio", () => {
  const t = new Date("2026-11-09T07:02:00Z");
  assert.ok(Math.abs(delta(longitude("Moon", t), longitude("Sun", t))) < 0.05);
  assert.ok(Math.abs(longitude("Sun", t) - (210 + 16 + 53 / 60)) < 0.05);
  // the true node stays within about 1.7° of the mean node
  const T = A.MakeTime(t).tt / 36525;
  const mean = (((125.0445479 - 1934.1362891 * T) % 360) + 360) % 360;
  assert.ok(Math.abs(delta(trueNode(t), mean)) < 1.8);
});

test("a solar return falls when the Sun is back on its birth degree", () => {
  const moment = sunAt(196.8, new Date("2026-10-08T00:00:00Z"), 8)!;
  assert.ok(Math.abs(delta(longitude("Sun", moment), 196.8)) < 0.001);
});

test("a contact is found with its passes and exact moments", () => {
  // a point moving 1° a day forward, then back over the same ground, then forward again: three exact passes
  const t0 = Date.UTC(2030, 0, 1);
  const path = (t: number) => {
    const d = (t - t0) / DAY;
    return d < 10 ? d : d < 20 ? 20 - d : d - 20;
  };
  const times = sampleTimes(t0, t0 + 40 * DAY, 1);
  const found = episodes(times, times.map((t) => path(t) - 5), 1.5, 1, (t) => path(t) - 5, 30);
  assert.equal(found.length, 1);
  assert.equal(found[0]!.exact.length, 3);
  assert.ok(Math.abs(found[0]!.exact[0]! - (t0 + 5 * DAY)) < 60_000);
});

test("the moment of birth follows the zone's own history (London was on summer time in October 1994)", () => {
  const clara = sample.find((c) => c.id === "chart-clara-mercer")!;
  assert.equal(birthMoment(clara).toISOString(), "1994-10-12T13:35:00.000Z");
});

test("profections move the Ascendant's sign on one sign a year, with the sign's traditional ruler as lord", () => {
  const natal = natalOf(sample.find((c) => c.id === "chart-clara-mercer")!);
  const years = profections(natal, Date.UTC(2026, 11, 1), Date.UTC(2026, 11, 2));
  assert.equal(years.length, 1);
  const ascSign = natal.ascSign!;
  const signs = ["Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo", "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces"];
  assert.equal(years[0]!.sign, signs[(ascSign + years[0]!.age) % 12]);
  assert.equal(years[0]!.house, (years[0]!.age % 12) + 1);
  assert.equal(years[0]!.lord, natal.rulers.traditional[years[0]!.sign]);
});

test("zodiacal releasing jumps to the opposite sign once its sub-periods have gone round the zodiac", () => {
  const natal = natalOf(sample.find((c) => c.id === "chart-clara-mercer")!);
  const periods = releasing(natal, "spirit", natal.birth.getTime(), natal.birth.getTime() + 80 * 365 * DAY);
  const level1 = periods.filter((p) => p.level === 1);
  for (let i = 1; i < level1.length; i += 1) assert.equal(level1[i]!.start, level1[i - 1]!.end);
  const jumps = periods.filter((p) => p.loosing);
  assert.ok(jumps.length > 0, "a long period loosens its bond");
  for (const jump of jumps) {
    const parent = level1.find((p) => p.start <= jump.start && jump.start < p.end)!;
    const signs = ["Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo", "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces"];
    assert.equal(signs.indexOf(jump.sign), (signs.indexOf(parent.sign) + 6) % 12);
  }
});

test("a forecast ranks its signals and carries the library's words for them", () => {
  const chart = sample.find((c) => c.id === "chart-clara-mercer")!;
  const f = buildForecast(chart, { mode: "ahead", from: "2026-11-01", to: "2027-11-01" });
  assert.ok(f.indicators.length > 0);
  for (let i = 1; i < f.indicators.length; i += 1) assert.ok(f.indicators[i - 1]!.score >= f.indicators[i]!.score);
  assert.match(f.meanings["techniques/transits"]?.definition ?? "", /natal chart/);
  assert.equal(f.meanings["techniques/solar_arc_directions"]?.draft, true);
  assert.ok(f.years.length >= 1 && f.solarReturns.length >= 1);
  // keys are stable: the same forecast twice gives the same keys
  const again = buildForecast(chart, { mode: "ahead", from: "2026-11-01", to: "2027-11-01" });
  assert.deepEqual(again.indicators.map((i) => i.key).sort(), f.indicators.map((i) => i.key).sort());
});

test("without a birth time only the planets are timed", () => {
  const chart = sample.find((c) => !c.birth.timeKnown)!;
  const f = buildForecast(chart, { mode: "back", from: "2020-01-01", to: "2022-01-01" });
  assert.ok(f.limits.some((l) => /birth time/.test(l)));
  assert.equal(f.years.length, 0);
  assert.equal(f.solarReturns.length, 0);
  assert.ok(f.indicators.every((i) => i.target.kind !== "angle"));
});
