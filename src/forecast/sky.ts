/**
 * Where the sky's bodies are, for the forecast (TASK-0015): geocentric apparent longitudes in the tropical zodiac,
 * on the true ecliptic and equinox of date, from astronomy-engine (MIT; VSOP87 and the NOVAS-checked models, to
 * within about an arcminute), and the true lunar node from Meeus.
 *
 * Positions are of date, not J2000: the equinox moves about 50″ a year, so a J2000 longitude would be off by more
 * than half a degree for a chart from the 1970s, which is wider than some of the forecast's orbs.
 */
import * as A from "astronomy-engine";

export type SkyBody = "Sun" | "Moon" | "Mercury" | "Venus" | "Mars" | "Jupiter" | "Saturn" | "Uranus" | "Neptune" | "Pluto" | "North Node";

const BODIES: Readonly<Record<Exclude<SkyBody, "North Node">, A.Body>> = {
  Sun: A.Body.Sun,
  Moon: A.Body.Moon,
  Mercury: A.Body.Mercury,
  Venus: A.Body.Venus,
  Mars: A.Body.Mars,
  Jupiter: A.Body.Jupiter,
  Saturn: A.Body.Saturn,
  Uranus: A.Body.Uranus,
  Neptune: A.Body.Neptune,
  Pluto: A.Body.Pluto,
};

export const DAY_MS = 86_400_000;
export const norm = (deg: number): number => ((deg % 360) + 360) % 360;
/** The signed distance from b to a, between -180 and 180. */
export const delta = (a: number, b: number): number => ((((a - b) % 360) + 540) % 360) - 180;
const rad = (d: number) => (d * Math.PI) / 180;

/**
 * The true lunar node (the North Node), Meeus, Astronomical Algorithms, 2nd ed. (1998), ch. 47: the mean node and
 * the five periodic terms of the true node given there. The natal charts use the true node too.
 */
export function trueNode(date: Date): number {
  const T = A.MakeTime(date).tt / 36525;
  const D = 297.8501921 + 445267.1114034 * T - 0.0018819 * T * T + (T * T * T) / 545868;
  const M = 357.5291092 + 35999.0502909 * T - 0.0001536 * T * T;
  const Mp = 134.9633964 + 477198.8675055 * T + 0.0087414 * T * T + (T * T * T) / 69699;
  const F = 93.272095 + 483202.0175233 * T - 0.0036539 * T * T - (T * T * T) / 3526000;
  const mean = 125.0445479 - 1934.1362891 * T + 0.0020754 * T * T + (T * T * T) / 467441;
  return norm(mean - 1.4979 * Math.sin(rad(2 * (D - F))) - 0.15 * Math.sin(rad(M)) - 0.1226 * Math.sin(rad(2 * D)) + 0.1176 * Math.sin(rad(2 * F)) - 0.0801 * Math.sin(rad(2 * (Mp - F))));
}

/** A body's longitude at a moment. */
export function longitude(body: SkyBody, date: Date): number {
  if (body === "North Node") return trueNode(date);
  const time = A.MakeTime(date);
  if (body === "Sun") return norm(A.SunPosition(time).elon);
  if (body === "Moon") return norm(A.EclipticGeoMoon(time).lon);
  const vector = A.GeoVector(BODIES[body], time, true);
  return norm(A.SphereFromVector(A.RotateVector(A.Rotation_EQJ_ECT(time), vector)).lon);
}

/** Degrees per day, by a central difference; negative while the body is retrograde. */
export function speed(body: SkyBody, date: Date): number {
  const h = body === "Moon" ? 0.05 : 0.5;
  const before = longitude(body, new Date(date.getTime() - h * DAY_MS));
  const after = longitude(body, new Date(date.getTime() + h * DAY_MS));
  return delta(after, before) / (2 * h);
}

/** The moment the Sun reaches a longitude, searched from a date for a number of days. */
export function sunAt(lon: number, from: Date, days: number): Date | null {
  const found = A.SearchSunLongitude(lon, A.MakeTime(from), days);
  return found ? found.date : null;
}

/** New moons (phase 0) and full moons (phase 180) between two dates. */
export function lunations(from: Date, to: Date): { kind: "new" | "full"; date: Date; lon: number }[] {
  const out: { kind: "new" | "full"; date: Date; lon: number }[] = [];
  for (const phase of [0, 180] as const) {
    let t = A.MakeTime(from);
    for (;;) {
      const found = A.SearchMoonPhase(phase, t, 40);
      if (!found || found.date > to) break;
      out.push({ kind: phase === 0 ? "new" : "full", date: found.date, lon: longitude("Moon", found.date) });
      t = found.AddDays(1);
    }
  }
  return out.sort((a, b) => a.date.getTime() - b.date.getTime());
}

export interface Eclipse {
  readonly kind: "solar" | "lunar";
  readonly type: string;
  readonly date: Date;
  /** Where it falls: the Sun's longitude for a solar eclipse, the Moon's for a lunar one. */
  readonly lon: number;
}

/** Solar and lunar eclipses between two dates, with their type (total, annular, partial, penumbral). */
export function eclipses(from: Date, to: Date): Eclipse[] {
  const out: Eclipse[] = [];
  let lunar = A.SearchLunarEclipse(A.MakeTime(from));
  while (lunar.peak.date <= to) {
    out.push({ kind: "lunar", type: String(lunar.kind), date: lunar.peak.date, lon: longitude("Moon", lunar.peak.date) });
    lunar = A.NextLunarEclipse(lunar.peak);
  }
  let solar = A.SearchGlobalSolarEclipse(A.MakeTime(from));
  while (solar.peak.date <= to) {
    out.push({ kind: "solar", type: String(solar.kind), date: solar.peak.date, lon: longitude("Sun", solar.peak.date) });
    solar = A.NextGlobalSolarEclipse(solar.peak);
  }
  return out.sort((a, b) => a.date.getTime() - b.date.getTime());
}

/** Greenwich apparent sidereal time in degrees, and the true obliquity of the ecliptic, at a moment. */
export function siderealAndObliquity(date: Date): { gast: number; obliquity: number } {
  const time = A.MakeTime(date);
  return { gast: norm(A.SiderealTime(time) * 15), obliquity: A.e_tilt(time).tobl };
}
