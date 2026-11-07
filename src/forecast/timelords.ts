/**
 * The year and the chapters of life: annual profections and zodiacal releasing (Vettius Valens, Anthology, Book IV;
 * Chris Brennan, Hellenistic Astrology, 2017), and the solar return (Abu Ma'shar, On the Revolutions of the Years of
 * Nativities, trans. B. Dykes, 2019). These set the context the transits, progressions and arcs are weighed in.
 */
import { longitude, sunAt, type SkyBody } from "./sky";
import { houseOf, houses } from "./houses";
import { formatLon, SIGNS, signOf, type Natal } from "./natal";
import type { ProfectionYear, ReleasingPeriod, SolarReturn } from "./types";
import { DAY, iso } from "./scan";

export const ordinal = (n: number): string => `${n}${n % 100 >= 11 && n % 100 <= 13 ? "th" : n % 10 === 1 ? "st" : n % 10 === 2 ? "nd" : n % 10 === 3 ? "rd" : "th"}`;

/** The birth moment's anniversary n years on, at the same UT time of day. */
function anniversary(natal: Natal, n: number): number {
  const b = natal.birth;
  return Date.UTC(b.getUTCFullYear() + n, b.getUTCMonth(), b.getUTCDate(), b.getUTCHours(), b.getUTCMinutes());
}

const lordsOf = (natal: Natal, sign: string): { lord: string; coLord: string | null } => {
  const lord = natal.rulers.traditional[sign] ?? natal.rulers.modern[sign] ?? "";
  const modern = natal.rulers.modern[sign] ?? lord;
  return { lord, coLord: modern !== lord ? modern : null };
};

/** One profection year per birthday in the range: the Ascendant's sign moved on one sign a year. */
export function profections(natal: Natal, from: number, to: number): ProfectionYear[] {
  if (natal.ascSign === null) return [];
  const out: ProfectionYear[] = [];
  for (let age = 0; age < 130; age += 1) {
    const start = anniversary(natal, age);
    const end = anniversary(natal, age + 1);
    if (end < from) continue;
    if (start > to) break;
    const sign = SIGNS[(natal.ascSign + age) % 12]!;
    const { lord, coLord } = lordsOf(natal, sign);
    const lordPoint = natal.points.find((p) => p.name === lord);
    out.push({
      age,
      start: iso(start),
      end: iso(end),
      sign,
      house: (age % 12) + 1,
      lord,
      coLord,
      lordPosition: lordPoint ? `${formatLon(lordPoint.lon)}${lordPoint.house ? `, ${ordinal(lordPoint.house)} house` : ""}` : null,
    });
  }
  return out;
}

// Valens' periods by sign: the minor years of each sign's ruler, Capricorn 27 and Aquarius 30 for Saturn
const PERIOD_YEARS: Readonly<Record<string, number>> = { Aries: 15, Taurus: 8, Gemini: 20, Cancer: 25, Leo: 19, Virgo: 20, Libra: 8, Scorpio: 15, Sagittarius: 12, Capricorn: 27, Aquarius: 30, Pisces: 12 };
/**
 * How long releasing's years are. Valens counts years of 360 days and months of 30, so the chapters drift from the
 * birthday by about five days a year; the calendar year (365.2425 days, months of a twelfth of it) keeps them on it.
 * Valens is the default; the forecast says which one it used.
 */
export type ReleasingYear = "valens" | "calendar";
export const RELEASING_YEAR_DAYS: Readonly<Record<ReleasingYear, number>> = { valens: 360, calendar: 365.2425 };

/**
 * Zodiacal releasing from a lot: level 1 runs through the signs from the lot's sign, each for its period in years;
 * level 2 subdivides each level-1 period the same way in months, and when its sub-periods have gone round all
 * twelve signs, it jumps to the sign opposite (the "loosing of the bond"). Peaks are the signs angular to Fortune.
 */
export function releasing(natal: Natal, lot: "spirit" | "fortune", from: number, to: number, year: ReleasingYear = "valens"): ReleasingPeriod[] {
  if (!natal.lots || natal.ascSign === null) return [];
  const RELEASING_YEAR = RELEASING_YEAR_DAYS[year] * DAY;
  const RELEASING_MONTH = RELEASING_YEAR / 12;
  const lotSign = Math.floor(natal.lots[lot] / 30);
  const fortuneSign = Math.floor(natal.lots.fortune / 30);
  const ascSign = natal.ascSign;
  const describe = (level: 1 | 2, signIndex: number, start: number, end: number, loosing: boolean): ReleasingPeriod => {
    const sign = SIGNS[signIndex]!;
    const fromFortune = (((signIndex - fortuneSign) % 12) + 12) % 12;
    return {
      lot,
      level,
      sign,
      start: iso(start),
      end: iso(end),
      house: ((((signIndex - ascSign) % 12) + 12) % 12) + 1,
      ruler: natal.rulers.traditional[sign] ?? "",
      peak: fromFortune === 9 ? "highest" : fromFortune % 3 === 0 ? "peak" : null,
      loosing,
    };
  };
  const out: ReleasingPeriod[] = [];
  let start = natal.birth.getTime();
  for (let k = 0; start <= to && k < 24; k += 1) {
    const sign1 = (lotSign + k) % 12;
    const end1 = start + PERIOD_YEARS[SIGNS[sign1]!]! * RELEASING_YEAR;
    if (end1 >= from) {
      out.push(describe(1, sign1, start, end1, false));
      let s2 = start;
      let sign2 = sign1;
      let count = 0;
      let loosing = false;
      while (s2 < end1) {
        const e2 = Math.min(end1, s2 + PERIOD_YEARS[SIGNS[sign2]!]! * RELEASING_MONTH);
        if (e2 >= from && s2 <= to) out.push(describe(2, sign2, s2, e2, loosing));
        s2 = e2;
        count += 1;
        loosing = false;
        sign2 = (sign2 + 1) % 12;
        if (count === 12) {
          sign2 = (sign1 + 6) % 12;
          loosing = true;
        }
      }
    }
    start = end1;
  }
  return out;
}

const RETURN_BODIES: readonly SkyBody[] = ["Sun", "Moon", "Mercury", "Venus", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune", "Pluto"];

/** The solar returns whose year touches the range, cast for a place (the birthplace unless another is given). */
export function solarReturns(natal: Natal, from: number, to: number, place: { latitude: number; longitude: number; label: string }): SolarReturn[] {
  const sun = natal.points.find((p) => p.id === "planets/sun");
  if (!sun) return [];
  const out: SolarReturn[] = [];
  const first = new Date(from).getUTCFullYear() - 1;
  const last = new Date(to).getUTCFullYear();
  for (let year = first; year <= last; year += 1) {
    const guess = Date.UTC(year, natal.birth.getUTCMonth(), natal.birth.getUTCDate()) - 4 * DAY;
    const moment = sunAt(sun.lon, new Date(guess), 8);
    if (!moment) continue;
    const t = moment.getTime();
    if (t + 365 * DAY < from || t > to) continue;
    const chart = houses(moment, place.latitude, place.longitude);
    const lon = (b: SkyBody) => longitude(b, moment);
    const angular = RETURN_BODIES.filter((b) => [chart.asc, chart.mc, chart.asc + 180, chart.mc + 180].some((a) => Math.abs(((lon(b) - a + 540) % 360) - 180) <= 5));
    const moon = lon("Moon");
    out.push({
      year,
      date: iso(t),
      place: place.label,
      ascendant: formatLon(chart.asc),
      midheaven: formatLon(chart.mc),
      ascendantInNatalHouse: natal.cusps ? houseOf(chart.asc, natal.cusps) : null,
      sunHouse: houseOf(lon("Sun"), chart.cusps),
      moonHouse: houseOf(moon, chart.cusps),
      moon: `${formatLon(moon)}`,
      angular,
      system: chart.system,
    });
  }
  return out;
}

export { signOf };
