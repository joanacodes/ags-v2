/**
 * The weighting that makes a forecast worth reading (TASK-0015, approved by the owner on 2026-11-01): a signal counts
 * by what moves, how, and what it meets in the birth chart; it counts more when it involves the lord of the year,
 * when the planet stations on the point, and most when several techniques meet the same point at the same time.
 * A single transit on its own is a weak signal. The figures are starting values, to be tuned with the look-back
 * marks (do the periods it ranks highest match the periods people recognise?).
 */
import type { Natal } from "./natal";
import type { AspectName, Indicator, ProfectionYear, ReleasingPeriod } from "./types";

const TRANSIT_BASE: Readonly<Record<string, number>> = { Pluto: 5, Neptune: 4.5, Uranus: 4.5, Saturn: 4, Jupiter: 3, "North Node": 2.5 };
const PROGRESSION_BASE: Readonly<Record<string, number>> = { "progressed Sun": 4, "progressed Mercury": 3, "progressed Venus": 3, "progressed Mars": 3, "progressed Moon": 1.5 };
const SOLAR_ARC_BASE = 3.5;
const ECLIPSE_BASE = 2.5;
const ASPECT_FACTOR: Readonly<Record<AspectName, number>> = { conjunction: 1, opposition: 0.9, square: 0.9, trine: 0.6, sextile: 0.5 };

export { KEY, NOTABLE } from "./types";

function overlaps(a: { start: string; end: string }, b: { start: string; end: string }): boolean {
  return a.start <= b.end && b.start <= a.end;
}

export function score(indicators: Indicator[], natal: Natal, years: readonly ProfectionYear[], spirit: readonly ReleasingPeriod[]): Indicator[] {
  const ascSign = natal.ascSign;
  const chartRulers = new Set<string>();
  if (ascSign !== null) {
    const sign = ["Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo", "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces"][ascSign]!;
    for (const table of [natal.rulers.modern, natal.rulers.traditional]) if (table[sign]) chartRulers.add(table[sign]!);
  }
  for (const ind of indicators) {
    const reasons = ind.reasons;
    let base =
      ind.technique === "transit"
        ? TRANSIT_BASE[ind.mover] ?? 2
        : ind.technique === "progression"
          ? PROGRESSION_BASE[ind.mover] ?? 2
          : ind.technique === "solar-arc"
            ? SOLAR_ARC_BASE * (ind.moverId?.startsWith("angles/") || ind.target.kind === "angle" ? 1.15 : 1)
            : ECLIPSE_BASE * (ind.mover.startsWith("penumbral") ? 0.6 : 1) * (reasons.includes("within 1° of the point") ? 1.2 : 1);
    if (ind.technique !== "eclipse") base *= ASPECT_FACTOR[ind.aspect];
    // what it meets: the lights and the angles first, the chart ruler next; the outer planets as natal points less
    const t = ind.target;
    let factor = 1;
    if (["planets/sun", "planets/moon", "angles/ascendant", "angles/midheaven"].includes(t.id)) {
      factor = 1.3;
      reasons.push(t.kind === "angle" ? "an angle of the chart" : "one of the two lights");
    } else if (chartRulers.has(t.name)) {
      factor = 1.25;
      reasons.push("the chart ruler");
    } else if (["planets/uranus", "planets/neptune", "planets/pluto"].includes(t.id)) factor = 0.8;
    else if (["points/chiron", "points/lilith"].includes(t.id)) factor = 1.1;
    else if (t.id === "points/north_node") factor = 0.9;
    let s = base * factor;
    if (ind.station) {
      s *= 1.3;
      reasons.push("the planet stations on the point");
    }
    if (ind.returnOf) reasons.push(`${ind.returnOf} return`);
    // the time lord: the lord of a profection year that overlaps the window, as the mover or as the point
    const lordYears = years.filter((y) => overlaps(ind, y) && (ind.mover.endsWith(y.lord) || t.name === y.lord || (y.coLord !== null && (ind.mover.endsWith(y.coLord) || t.name === y.coLord))));
    if (lordYears.length) {
      s *= 1.5;
      reasons.push(`involves the lord of the year (${lordYears[0]!.lord}${lordYears[0]!.coLord ? `, ${lordYears[0]!.coLord}` : ""})`);
    }
    // a point in the year's profected sign
    if (ascSign !== null && years.some((y) => overlaps(ind, y) && Math.floor(t.lon / 30) === (ascSign + y.age) % 12)) {
      s *= 1.2;
      reasons.push("in the year's profected sign");
    }
    if (spirit.some((p) => p.level === 2 && p.peak && overlaps(ind, p))) {
      s *= 1.1;
      reasons.push("during a peak period of releasing from Spirit");
    }
    ind.base = Math.round(base * 100) / 100;
    ind.score = s;
  }
  // convergence: different techniques on the same point in overlapping windows
  for (const ind of indicators) {
    const techniques = new Set(indicators.filter((o) => o.target.id === ind.target.id && overlaps(o, ind)).map((o) => o.technique));
    ind.convergence = techniques.size;
    if (techniques.size > 1) {
      ind.score *= 1 + 0.5 * (techniques.size - 1);
      ind.reasons.push(`${techniques.size} techniques meet this point at the same time`);
    }
    ind.score = Math.round(ind.score * 100) / 100;
  }
  return indicators.sort((a, b) => b.score - a.score || a.start.localeCompare(b.start));
}
