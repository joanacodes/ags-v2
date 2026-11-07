/**
 * The angles and the Placidus houses of a moment and a place, for the charts the forecast casts itself (the solar
 * returns): the natal chart's own houses come from the chart. Placidus because it is the system AGS reads natal
 * charts in; above the polar circles, where Placidus has no answer, the cusps fall back to equal houses from the
 * Ascendant and say so.
 */
import { delta, norm, siderealAndObliquity } from "./sky";

const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

export interface Angles {
  readonly asc: number;
  readonly mc: number;
}

/** The Ascendant and the Midheaven from the local sidereal time (RAMC), the latitude and the obliquity. */
export function anglesFrom(ramc: number, latitude: number, obliquity: number): Angles {
  const r = rad(ramc);
  const e = rad(obliquity);
  const mc = norm(deg(Math.atan2(Math.sin(r), Math.cos(r) * Math.cos(e))));
  const asc = norm(deg(Math.atan2(Math.cos(r), -(Math.sin(r) * Math.cos(e) + Math.tan(rad(latitude)) * Math.sin(e)))));
  return { asc, mc };
}

// a point of the ecliptic: its right ascension to longitude, and its declination
const lonFromRa = (ra: number, e: number) => norm(deg(Math.atan2(Math.sin(rad(ra)), Math.cos(rad(ra)) * Math.cos(rad(e)))));
const decOf = (lon: number, e: number) => deg(Math.asin(Math.sin(rad(e)) * Math.sin(rad(lon))));

/**
 * A Placidus cusp: the ecliptic point whose hour angle is a set fraction of its own semi-arc. Houses 11 and 12 sit
 * one and two thirds of the diurnal semi-arc east of the meridian, houses 2 and 3 two and one thirds of the
 * nocturnal semi-arc from the lower meridian; the declination depends on the point, so the point is found by
 * iteration from the equal-house guess.
 */
function placidusCusp(ramc: number, latitude: number, e: number, house: 11 | 12 | 2 | 3): number | null {
  const tanPhi = Math.tan(rad(latitude));
  let lon = norm(ramc + ({ 11: 30, 12: 60, 2: 120, 3: 150 } as const)[house]);
  for (let i = 0; i < 60; i += 1) {
    const x = -tanPhi * Math.tan(rad(decOf(lon, e)));
    if (Math.abs(x) > 1) return null;
    const dsa = deg(Math.acos(x));
    const nsa = 180 - dsa;
    const ra = house === 11 ? ramc + dsa / 3 : house === 12 ? ramc + (2 * dsa) / 3 : house === 2 ? ramc + 180 - (2 * nsa) / 3 : ramc + 180 - nsa / 3;
    const next = lonFromRa(norm(ra), e);
    if (Math.abs(delta(next, lon)) < 1e-7) return next;
    lon = next;
  }
  return lon;
}

export interface HouseChart extends Angles {
  /** The twelve cusps, the 1st first. */
  readonly cusps: readonly number[];
  readonly system: "Placidus" | "Equal";
}

/** The angles and houses for a moment (UT) and a place (longitude east positive). */
export function houses(date: Date, latitude: number, longitude: number): HouseChart {
  const { gast, obliquity } = siderealAndObliquity(date);
  const ramc = norm(gast + longitude);
  const { asc, mc } = anglesFrom(ramc, latitude, obliquity);
  const c11 = placidusCusp(ramc, latitude, obliquity, 11);
  const c12 = placidusCusp(ramc, latitude, obliquity, 12);
  const c2 = placidusCusp(ramc, latitude, obliquity, 2);
  const c3 = placidusCusp(ramc, latitude, obliquity, 3);
  if (c11 === null || c12 === null || c2 === null || c3 === null) {
    return { asc, mc, system: "Equal", cusps: Array.from({ length: 12 }, (_, i) => norm(asc + 30 * i)) };
  }
  const ic = norm(mc + 180);
  const cusps = [asc, c2, c3, ic, norm(c11 + 180), norm(c12 + 180), norm(asc + 180), norm(c2 + 180), norm(c3 + 180), mc, c11, c12];
  return { asc, mc, system: "Placidus", cusps };
}

/** The house a longitude falls in, given twelve cusps. */
export function houseOf(lon: number, cusps: readonly number[]): number {
  for (let i = 0; i < 12; i += 1) {
    const start = cusps[i]!;
    const end = cusps[(i + 1) % 12]!;
    const span = norm(end - start);
    if (norm(lon - start) < span) return i + 1;
  }
  return 1;
}
