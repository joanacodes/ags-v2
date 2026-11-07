import { test } from "node:test";
import assert from "node:assert/strict";
import * as A from "astronomy-engine";
import { houses, houseOf } from "../houses";
import { delta, longitude, speed, sunAt, trueNode } from "../sky";
import { chironHeliocentric } from "../chiron";
import { episodes, sampleTimes, DAY } from "../scan";
import { birthMoment, natalOf } from "../natal";
import { profections, releasing } from "../timelords";
import { buildForecast, NO_BIRTH_TIME } from "../index";
import charts from "../../data/sample-charts.json";
import type { Chart, ZodiacSign } from "../../types";

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

test("without a birth time there is no forecast", () => {
  const chart = sample.find((c) => !c.birth.timeKnown)!;
  assert.throws(() => buildForecast(chart, { mode: "back", from: "2020-01-01", to: "2022-01-01" }), (e: unknown) => e instanceof Error && e.message === NO_BIRTH_TIME);
});

// Chiron's apparent longitude from the Swiss Ephemeris asteroid file's own positions (seas_18.se1, read 2026-11-01),
// put through the same light-time, aberration and rotation as ours: the orbit chiron.ts integrates must stay on it
const CHIRON_REFERENCE: readonly [string, number][] = [
  ["1900-06-01", 262.77307],
  ["1925-03-15", 22.35851],
  ["1950-01-01", 255.77726],
  ["1996-02-14", 194.09054],
  ["2000-01-01T12:00:00Z", 251.61755],
  ["2026-11-01", 28.07449],
  ["2050-07-01", 246.53808],
  ["2075-01-01", 18.09919],
  ["2099-12-01", 238.01316],
];

test("transiting Chiron stays within 0.015° of the reference from 1900 to 2100", () => {
  for (const [date, lon] of CHIRON_REFERENCE) {
    const ours = longitude("Chiron", new Date(date));
    assert.ok(Math.abs(delta(ours, lon)) < 0.015, `${date}: ${ours.toFixed(5)} against ${lon}`);
  }
  assert.throws(() => longitude("Chiron", new Date("1850-01-01")), /1900 to 2100/);
});

// the day, in New York, of each moment Chiron crosses a longitude or turns, between two dates
function eastern(t: number): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(t));
}
function chironCrossings(lon: number, from: string, to: string): number[] {
  const out: number[] = [];
  let prev = delta(longitude("Chiron", new Date(from)), lon);
  for (let t = Date.parse(from) + DAY; t <= Date.parse(to); t += DAY) {
    const cur = delta(longitude("Chiron", new Date(t)), lon);
    if (Math.sign(cur) !== Math.sign(prev) && Math.abs(cur) < 5) {
      let lo = t - DAY;
      let hi = t;
      for (let k = 0; k < 30; k += 1) {
        const mid = (lo + hi) / 2;
        if (Math.sign(delta(longitude("Chiron", new Date(mid)), lon)) === Math.sign(prev)) lo = mid;
        else hi = mid;
      }
      out.push(hi);
    }
    prev = cur;
  }
  return out;
}

test("transiting Chiron enters Aries and Taurus, and stations, on the published dates", () => {
  // Café Astrology's event pages (Eastern time): Aries on 17 April 2018, back into Pisces on 25 September 2018 (8:12 pm),
  // Aries again on 18 February 2019 (4:07 am); Taurus on 19 June 2026, back into Aries on 17 September 2026, Taurus
  // again on 14 April 2027
  assert.deepEqual(chironCrossings(0, "2018-01-01", "2019-06-01").map(eastern), ["2018-04-17", "2018-09-25", "2019-02-18"]);
  assert.deepEqual(chironCrossings(30, "2026-01-01", "2027-12-31").map(eastern), ["2026-06-19", "2026-09-17", "2027-04-14"]);
  const [, september, february] = chironCrossings(0, "2018-01-01", "2019-06-01");
  assert.ok(Math.abs(september! - Date.parse("2018-09-26T00:12:00Z")) < 20 * 60_000);
  assert.ok(Math.abs(february! - Date.parse("2019-02-18T09:07:00Z")) < 20 * 60_000);
  // and the stations: retrograde on 3 August 2026 at 0°52′ Taurus, direct on 6 January 2027 at 26°16′ Aries
  const turns: { t: number; lon: number }[] = [];
  let before = speed("Chiron", new Date("2026-06-01"));
  for (let t = Date.parse("2026-06-01") + DAY; t <= Date.parse("2027-03-01"); t += DAY) {
    const now = speed("Chiron", new Date(t));
    if (Math.sign(now) !== Math.sign(before)) {
      let lo = t - DAY;
      let hi = t;
      for (let k = 0; k < 30; k += 1) {
        const mid = (lo + hi) / 2;
        if (Math.sign(speed("Chiron", new Date(mid))) === Math.sign(before)) lo = mid;
        else hi = mid;
      }
      turns.push({ t: hi, lon: longitude("Chiron", new Date(hi)) });
    }
    before = now;
  }
  assert.deepEqual(turns.map((s) => eastern(s.t)), ["2026-08-03", "2027-01-06"]);
  assert.ok(Math.abs(turns[0]!.lon - (30 + 52 / 60)) < 1 / 60);
  assert.ok(Math.abs(turns[1]!.lon - (26 + 16 / 60)) < 1 / 60);
});

test("Chiron's orbit comes closest to the Sun on 14 February 1996, as NASA records", () => {
  // NASA NSSDC, Chiron fact sheet: perihelion 14 February 1996, 18:06 UT
  let closest = { t: 0, r: Infinity };
  for (let t = Date.parse("1995-11-01"); t <= Date.parse("1996-05-01"); t += DAY / 4) {
    const [x, y, z] = chironHeliocentric(A.MakeTime(new Date(t)).tt);
    const r = Math.hypot(x, y, z);
    if (r < closest.r) closest = { t, r };
  }
  assert.ok(Math.abs(closest.t - Date.parse("1996-02-14T18:06:00Z")) < 1.5 * DAY, new Date(closest.t).toISOString());
  assert.ok(closest.r > 8.4 && closest.r < 8.5);
});

test("a forecast finds the Chiron return, around fifty", () => {
  const base = sample.find((c) => c.id === "chart-clara-mercer")!;
  const born = birthMoment(base);
  const lon = longitude("Chiron", born);
  const SIGN_NAMES: ZodiacSign[] = ["Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo", "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces"];
  const chart: Chart = {
    ...base,
    points: [{ point: "Chiron", sign: SIGN_NAMES[Math.floor(lon / 30)]!, degree: Math.floor(lon % 30), minute: Math.floor(((lon % 30) % 1) * 60), house: 1 }],
  };
  const year = born.getUTCFullYear();
  const f = buildForecast(chart, { mode: "ahead", from: `${year + 48}-01-01`, to: `${year + 53}-01-01` });
  const back = f.indicators.filter((i) => i.mover === "Chiron" && i.returnOf === "Chiron");
  assert.ok(back.length >= 1);
  assert.equal(back[0]!.moverId, "points/chiron");
  assert.ok(back[0]!.reasons.includes("Chiron return"));
  assert.ok(back.some((i) => i.exact.length >= 1));
  assert.equal(f.limits.length, 0);
});

test("zodiacal releasing counts Valens's 360-day years unless calendar years are asked for", () => {
  const natal = natalOf(sample.find((c) => c.id === "chart-clara-mercer")!);
  const born = natal.birth.getTime();
  const firstEnd = (year: "valens" | "calendar") => Date.parse(releasing(natal, "spirit", born, born + 40 * 365 * DAY, year).find((p) => p.level === 1)!.end);
  const valens = firstEnd("valens");
  const calendar = firstEnd("calendar");
  // the same number of years, of 360 days against 365.2425
  const years = (valens - born) / (360 * DAY);
  assert.ok(Math.abs(years - Math.round(years)) < 1e-9);
  assert.ok(Math.abs((calendar - born) / (365.2425 * DAY) - years) < 1e-9);
  const chart = sample.find((c) => c.id === "chart-clara-mercer")!;
  const f = buildForecast(chart, { mode: "ahead", from: "2026-11-01", to: "2027-11-01", releasingYear: "calendar" });
  assert.match(f.settings.releasingYear, /calendar/);
});
