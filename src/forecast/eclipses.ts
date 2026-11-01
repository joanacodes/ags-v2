/**
 * Eclipses on the birth chart, and the day-to-day triggers. An eclipse within 3° of a natal point, on either end of
 * its axis, is a timing signal of its own; new and full moons and Mars contacts are not, but inside a window that
 * is already active they mark the days it is likeliest to be felt.
 */
import { delta, eclipses as skyEclipses, longitude, lunations } from "./sky";
import { houseOf } from "./houses";
import { formatLon, type Natal } from "./natal";
import type { Indicator, Milestone } from "./types";
import { ordinal } from "./timelords";
import { DAY, episodes, iso, month, sampleTimes } from "./scan";

export const ECLIPSE_ORB = 3;
const TRIGGER_ORB = 1;

export function eclipseIndicators(natal: Natal, from: number, to: number): { indicators: Indicator[]; milestones: Milestone[] } {
  const indicators: Indicator[] = [];
  const milestones: Milestone[] = [];
  for (const e of skyEclipses(new Date(from - 30 * DAY), new Date(to))) {
    const t = e.date.getTime();
    if (t < from || t > to) continue;
    const name = `${e.kind} eclipse`;
    const kind = e.type.toLowerCase();
    const house = natal.cusps ? houseOf(e.lon, natal.cusps) : null;
    milestones.push({ date: iso(t), technique: "eclipse", text: `${kind.charAt(0).toUpperCase()}${kind.slice(1)} ${name} at ${formatLon(e.lon)}${house ? `, in your ${ordinal(house)} house` : ""}.` });
    for (const target of natal.points) {
      for (const [aspect, axis] of [["conjunction", 0], ["opposition", 180]] as const) {
        const orb = Math.abs(delta(e.lon, target.lon + axis));
        if (orb > ECLIPSE_ORB) continue;
        indicators.push({
          key: `eclipse|${name}|${target.id}|${aspect}|${month(t)}`,
          technique: "eclipse",
          mover: `${kind} ${name}`,
          moverId: null,
          target,
          aspect,
          start: iso(t - 15 * DAY),
          end: iso(t + 15 * DAY),
          exact: [iso(t)],
          returnOf: null,
          station: false,
          triggers: [],
          base: 0,
          score: 0,
          convergence: 1,
          reasons: orb <= 1 ? ["within 1° of the point"] : [],
        });
      }
    }
  }
  return { indicators, milestones };
}

/** New and full moons, and Mars's conjunctions, squares and oppositions, on the point of an active window. */
export function attachTriggers(natal: Natal, indicators: Indicator[], from: number, to: number): void {
  if (!indicators.length) return;
  const moons = lunations(new Date(from), new Date(to));
  const times = sampleTimes(from - 2 * DAY, to + 2 * DAY, 1);
  const mars = times.map((t) => longitude("Mars", new Date(t)));
  const marsHits = new Map<string, { t: number; aspect: string }[]>();
  for (const target of natal.points) {
    const hits: { t: number; aspect: string }[] = [];
    for (const [aspect, angle] of [["conjunction", 0], ["square", 90], ["square", -90], ["opposition", 180]] as const) {
      const point = target.lon + angle;
      for (const e of episodes(times, mars.map((l) => delta(l, point)), TRIGGER_ORB, TRIGGER_ORB, (t) => delta(longitude("Mars", new Date(t)), point), 0)) {
        for (const x of e.exact) hits.push({ t: x, aspect });
      }
    }
    marsHits.set(target.id, hits);
  }
  for (const ind of indicators) {
    const start = Date.parse(ind.start);
    const end = Date.parse(ind.end);
    const found: { date: string; what: string }[] = [];
    for (const m of moons) {
      const t = m.date.getTime();
      if (t < start || t > end) continue;
      // a full moon has the Moon on one end of the axis and the Sun on the other
      const near = Math.abs(delta(m.lon, ind.target.lon)) <= TRIGGER_ORB || (m.kind === "full" && Math.abs(delta(m.lon + 180, ind.target.lon)) <= TRIGGER_ORB);
      if (near) found.push({ date: iso(t), what: `${m.kind === "new" ? "New" : "Full"} moon on your ${ind.target.name}` });
    }
    for (const h of marsHits.get(ind.target.id) ?? []) {
      if (h.t >= start && h.t <= end) found.push({ date: iso(h.t), what: `Mars ${h.aspect} your ${ind.target.name}` });
    }
    ind.triggers = found.sort((a, b) => a.date.localeCompare(b.date)).slice(0, 8);
  }
}
