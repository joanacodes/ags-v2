/**
 * Secondary progressions and solar arcs (Steven Forrest, The Changing Sky, 1986; Noel Tyl, Solar Arcs, 2001).
 *
 * Progressions take the sky one day after birth for each year of life: the progressed Moon moves about a degree a
 * month, the progressed Sun about a degree a year. Solar arcs move every natal point by the arc the progressed Sun
 * has travelled since birth. Both are measured against the birth chart with a 1° orb either side.
 */
import { delta, longitude, norm, speed, type SkyBody } from "./sky";
import { houseOf } from "./houses";
import { formatLon, signOf, type Natal, type NatalPoint } from "./natal";
import { type AspectName, type Indicator, type Milestone } from "./types";
import { ASPECT_SIDES } from "./transits";
import { DAY, episodes, iso, month, sampleTimes } from "./scan";
import { ordinal } from "./timelords";

export const PROGRESSION_ORB = 1;
const YEAR = 365.2422 * DAY;
const PROGRESSED: readonly { body: SkyBody; step: number }[] = [
  { body: "Sun", step: 30 },
  { body: "Moon", step: 4 },
  { body: "Mercury", step: 30 },
  { body: "Venus", step: 30 },
  { body: "Mars", step: 30 },
];

/** The progressed moment for a calendar moment: a day after birth for each year lived. */
export const progressedMoment = (natal: Natal, t: number): Date => new Date(natal.birth.getTime() + ((t - natal.birth.getTime()) / YEAR) * DAY);
export const progressedLon = (natal: Natal, body: SkyBody, t: number): number => longitude(body, progressedMoment(natal, t));

const indicator = (technique: "progression" | "solar-arc", mover: string, moverId: string | null, target: NatalPoint, aspect: AspectName, angle: number, e: { start: number; end: number; exact: readonly number[] }): Indicator => ({
  key: `${technique}|${mover}|${target.id}|${aspect}|${angle}|${month(e.exact[0] ?? e.start)}`,
  technique,
  mover,
  moverId,
  target,
  aspect,
  start: iso(e.start),
  end: iso(e.end),
  exact: e.exact.map(iso),
  returnOf: null,
  station: false,
  triggers: [],
  base: 0,
  score: 0,
  convergence: 1,
  reasons: [],
});

export function progressions(natal: Natal, from: number, to: number): { indicators: Indicator[]; milestones: Milestone[] } {
  const indicators: Indicator[] = [];
  const milestones: Milestone[] = [];
  const pad = 400 * DAY;
  for (const { body, step } of PROGRESSED) {
    const times = sampleTimes(Math.max(from - pad, natal.birth.getTime()), to + pad, step);
    const lons = times.map((t) => progressedLon(natal, body, t));
    for (const target of natal.points) {
      // a progressed planet meeting its own birth position is not a contact
      if (target.name === body) continue;
      for (const { aspect, angle } of ASPECT_SIDES) {
        const point = target.lon + angle;
        const found = episodes(times, lons.map((l) => delta(l, point)), PROGRESSION_ORB, PROGRESSION_ORB, (t) => delta(progressedLon(natal, body, t), point), 90);
        for (const e of found) {
          if (e.end < from || e.start > to) continue;
          indicators.push(indicator("progression", `progressed ${body}`, `planets/${body.toLowerCase()}`, target, aspect, angle, e));
        }
      }
    }
    // milestones inside the range: the progressed Moon changing sign or natal house, a progressed planet turning
    for (let i = 1; i < times.length; i += 1) {
      const t = times[i]!;
      if (t < from || t > to) continue;
      const before = lons[i - 1]!;
      const now = lons[i]!;
      if (body === "Moon") {
        if (signOf(before) !== signOf(now)) milestones.push({ date: iso(t), technique: "progression", text: `The progressed Moon enters ${signOf(now)}.` });
        if (natal.cusps && houseOf(before, natal.cusps) !== houseOf(now, natal.cusps)) milestones.push({ date: iso(t), technique: "progression", text: `The progressed Moon enters your ${ordinal(houseOf(now, natal.cusps))} house.` });
      } else if (body !== "Sun") {
        const v0 = speed(body, progressedMoment(natal, times[i - 1]!));
        const v1 = speed(body, progressedMoment(natal, t));
        if (Math.sign(v0) !== Math.sign(v1)) milestones.push({ date: iso(t), technique: "progression", text: `Progressed ${body} turns ${v1 < 0 ? "retrograde" : "direct"} at ${formatLon(now)}.` });
      }
    }
  }

  // solar arcs: every natal point moved by the progressed Sun's arc, against every other natal point
  const sun = natal.points.find((p) => p.id === "planets/sun");
  if (sun) {
    const times = sampleTimes(Math.max(from - pad, natal.birth.getTime()), to + pad, 15);
    const arcs = times.map((t) => norm(progressedLon(natal, "Sun", t) - sun.lon));
    const arcAt = (t: number) => norm(progressedLon(natal, "Sun", t) - sun.lon);
    const directed = natal.points.filter((p) => p.kind !== "point" || p.id === "points/chiron");
    for (const moving of directed) {
      for (const target of natal.points) {
        if (target.id === moving.id) continue;
        for (const { aspect, angle } of ASPECT_SIDES) {
          const point = target.lon + angle;
          const found = episodes(times, arcs.map((a) => delta(moving.lon + a, point)), PROGRESSION_ORB, PROGRESSION_ORB, (t) => delta(moving.lon + arcAt(t), point), 120);
          for (const e of found) {
            if (e.end < from || e.start > to) continue;
            indicators.push(indicator("solar-arc", `solar arc ${moving.name}`, moving.id, target, aspect, angle, e));
          }
        }
      }
    }
  }
  return { indicators, milestones };
}
