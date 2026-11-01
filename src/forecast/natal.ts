/**
 * The birth chart as the forecast reads it: every point as a longitude, the houses as cusps, the moment of birth in
 * UT, and what the time lords need (the sect, the two lots, the rulers). Read from the chart AGS already holds, so
 * the forecast measures against exactly the positions the readings use.
 */
import type { Chart, Placement } from "../types";
import { createCoreKnowledgeRegistry } from "../knowledge/pack-loader";
import { loadRulershipTable } from "../knowledge/conventions";
import { norm } from "./sky";
import { houseOf } from "./houses";

export const SIGNS = ["Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo", "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces"] as const;
export const lonOf = (p: Placement): number => SIGNS.indexOf(p.sign) * 30 + p.degree + p.minute / 60;
export const signOf = (lon: number): (typeof SIGNS)[number] => SIGNS[Math.floor(norm(lon) / 30)]!;
export const formatLon = (lon: number): string => {
  const l = norm(lon);
  const d = Math.floor(l % 30);
  const m = Math.floor(((l % 30) - d) * 60);
  return `${d}°${String(m).padStart(2, "0")}′ ${signOf(l)}`;
};

export interface NatalPoint {
  /** Also the key of its library entry ("planets/sun", "angles/ascendant", "points/chiron"). */
  readonly id: string;
  readonly name: string;
  readonly kind: "planet" | "angle" | "point";
  readonly lon: number;
  readonly house: number | null;
}

export interface Natal {
  readonly points: readonly NatalPoint[];
  readonly cusps: readonly number[] | null;
  readonly timeKnown: boolean;
  readonly birth: Date;
  readonly latitude: number;
  readonly longitude: number;
  readonly ascSign: number | null;
  readonly sect: "day" | "night" | null;
  readonly lots: { readonly fortune: number; readonly spirit: number } | null;
  /** Sign name → ruler, modern tropical and traditional (AGS reads both). */
  readonly rulers: { readonly modern: Readonly<Record<string, string>>; readonly traditional: Readonly<Record<string, string>> };
}

const ANGLE_IDS: Readonly<Record<string, { id: string; name: string }>> = {
  ASC: { id: "angles/ascendant", name: "Ascendant" },
  MC: { id: "angles/midheaven", name: "Midheaven" },
};
const POINT_IDS: Readonly<Record<string, string>> = { Chiron: "points/chiron", Lilith: "points/lilith", "North Node": "points/north_node" };

/** The zone's offset from UT, in minutes, at a moment (DST included, as the zone's history has it). */
function zoneOffset(instant: number, zone: string): number | null {
  try {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: zone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(new Date(instant));
    const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
    return (Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second")) - instant) / 60000;
  } catch {
    return null;
  }
}

/**
 * The moment of birth in UT: from the local time and the zone's own history when the zone is known (it knows
 * summer time in 1994 London, where a stored "+0:00" may not), else from the stored offset, else the Julian day.
 */
export function birthMoment(chart: Chart): Date {
  const [y, m, d] = chart.birth.date.split("-").map(Number) as [number, number, number];
  const [hh, mm] = (chart.birth.timeKnown && chart.birth.time ? chart.birth.time : "12:00").split(":").map(Number) as [number, number];
  const local = Date.UTC(y, m - 1, d, hh, mm);
  const zone = chart.birth.timezone;
  if (zone && zone !== "AUTO") {
    const first = zoneOffset(local, zone);
    if (first !== null) {
      const second = zoneOffset(local - first * 60000, zone) ?? first;
      return new Date(local - second * 60000);
    }
  }
  const offset = /([+-])\s*(\d{1,2})(?::(\d{2}))?/.exec(chart.birth.utcOffset ?? "");
  if (offset) {
    const minutes = (Number(offset[2]) * 60 + Number(offset[3] ?? 0)) * (offset[1] === "-" ? -1 : 1);
    return new Date(local - minutes * 60000);
  }
  if (typeof chart.birth.julianDay === "number") return new Date((chart.birth.julianDay - 2440587.5) * 86_400_000);
  return new Date(local);
}

export function natalOf(chart: Chart): Natal {
  const timeKnown = chart.birth.timeKnown && Boolean(chart.birth.time);
  const cusps =
    timeKnown && chart.houses.length >= 12
      ? [...chart.houses].sort((a, b) => a.number - b.number).slice(0, 12).map(lonOf)
      : null;
  const points: NatalPoint[] = [];
  for (const p of chart.planets) points.push({ id: `planets/${p.planet.toLowerCase()}`, name: p.planet, kind: "planet", lon: lonOf(p), house: timeKnown ? p.house : null });
  if (timeKnown) {
    for (const a of chart.angles) {
      const meta = ANGLE_IDS[a.point];
      if (meta) points.push({ id: meta.id, name: meta.name, kind: "angle", lon: lonOf(a), house: a.point === "ASC" ? 1 : 10 });
    }
  }
  for (const p of chart.points ?? []) {
    const id = POINT_IDS[p.point];
    if (id) points.push({ id, name: p.point, kind: "point", lon: lonOf(p), house: timeKnown ? p.house : null });
  }

  const sun = points.find((p) => p.id === "planets/sun");
  const moon = points.find((p) => p.id === "planets/moon");
  const asc = points.find((p) => p.id === "angles/ascendant");
  // a day chart has the Sun above the horizon: in houses 7 to 12
  const sunHouse = sun && cusps ? houseOf(sun.lon, cusps) : null;
  const sect = sunHouse === null ? null : sunHouse >= 7 ? "day" : "night";
  // the lots, Valens' way: Fortune is the Ascendant plus the Sun-to-Moon distance by day (Moon-to-Sun by night),
  // Spirit the reverse
  const lots =
    sun && moon && asc && sect
      ? {
          fortune: norm(asc.lon + (sect === "day" ? moon.lon - sun.lon : sun.lon - moon.lon)),
          spirit: norm(asc.lon + (sect === "day" ? sun.lon - moon.lon : moon.lon - sun.lon)),
        }
      : null;

  const registry = createCoreKnowledgeRegistry();
  const modern = loadRulershipTable(registry, "modern")?.rulers ?? {};
  const traditional = loadRulershipTable(registry, "traditional")?.rulers ?? {};

  return {
    points,
    cusps,
    timeKnown,
    birth: birthMoment(chart),
    latitude: chart.birth.latitude,
    longitude: chart.birth.longitude,
    ascSign: asc ? Math.floor(asc.lon / 30) : null,
    sect,
    lots,
    rulers: { modern, traditional },
  };
}
