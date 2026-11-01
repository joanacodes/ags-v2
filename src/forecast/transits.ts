/**
 * Transits (Robert Hand, Planets in Transit, 1976): the slow planets of the day against the birth chart. Jupiter to
 * Pluto and the lunar nodes, every major aspect to every natal point, with the passes a planet makes as it turns
 * back over a point, and the stations it makes on one. Transiting Chiron waits for a Chiron ephemeris (see the
 * forecast's limits); Chiron as a natal point is measured.
 */
import { delta, longitude, speed, type SkyBody } from "./sky";
import type { Natal } from "./natal";
import { ASPECT_ANGLES, type AspectName, type Indicator } from "./types";
import { DAY, episodes, iso, month, sampleTimes } from "./scan";

export const TRANSIT_ORB = { approaching: 1.5, separating: 1 } as const;
const MOVERS: readonly { body: SkyBody; step: number }[] = [
  { body: "Jupiter", step: 1 },
  { body: "Saturn", step: 1 },
  { body: "Uranus", step: 2 },
  { body: "Neptune", step: 2 },
  { body: "Pluto", step: 2 },
  { body: "North Node", step: 1 },
];
const STATION_ORB = 1;

/** Each aspect with the side it is made from: a square can be 90° ahead of the point or 90° behind. */
export const ASPECT_SIDES: readonly { aspect: AspectName; angle: number }[] = (Object.entries(ASPECT_ANGLES) as [AspectName, number][]).flatMap(([aspect, a]) =>
  a === 0 || a === 180 ? [{ aspect, angle: a }] : [{ aspect, angle: a }, { aspect, angle: -a }],
);

export function transits(natal: Natal, from: number, to: number): Indicator[] {
  const out: Indicator[] = [];
  const pad = 200 * DAY;
  for (const { body, step } of MOVERS) {
    const times = sampleTimes(from - pad, to + pad, step);
    const lons = times.map((t) => longitude(body, new Date(t)));
    // stations: where the planet's motion changes direction, and the degree it stands still on
    const stations: { t: number; lon: number }[] = [];
    if (body !== "North Node") {
      for (let i = 1; i + 1 < times.length; i += 1) {
        const v1 = delta(lons[i]!, lons[i - 1]!);
        const v2 = delta(lons[i + 1]!, lons[i]!);
        if (Math.sign(v1) !== Math.sign(v2)) {
          let lo = times[i - 1]!;
          let hi = times[i + 1]!;
          const s0 = Math.sign(speed(body, new Date(lo)));
          for (let k = 0; k < 24; k += 1) {
            const mid = (lo + hi) / 2;
            if (Math.sign(speed(body, new Date(mid))) === s0) lo = mid;
            else hi = mid;
          }
          stations.push({ t: (lo + hi) / 2, lon: longitude(body, new Date((lo + hi) / 2)) });
        }
      }
    }
    const moverId = body === "North Node" ? "points/north_node" : `planets/${body.toLowerCase()}`;
    for (const target of natal.points) {
      for (const { aspect, angle } of ASPECT_SIDES) {
        // the nodes work as an axis: only conjunctions and oppositions count
        if (body === "North Node" && aspect !== "conjunction" && aspect !== "opposition") continue;
        const point = target.lon + angle;
        const dist = lons.map((l) => delta(l, point));
        const found = episodes(times, dist, TRANSIT_ORB.approaching, TRANSIT_ORB.separating, (t) => delta(longitude(body, new Date(t)), point), 200);
        for (const e of found) {
          if (e.end < from || e.start > to) continue;
          const station = stations.some((s) => s.t >= e.start - 20 * DAY && s.t <= e.end + 20 * DAY && Math.abs(delta(s.lon, point)) <= STATION_ORB);
          const returnOf = aspect === "conjunction" && target.name === body ? body : null;
          out.push({
            key: `transit|${body}|${target.id}|${aspect}|${angle}|${month(e.exact[0] ?? e.start)}`,
            technique: "transit",
            mover: body,
            moverId,
            target,
            aspect,
            start: iso(e.start),
            end: iso(e.end),
            exact: e.exact.map(iso),
            returnOf,
            station,
            triggers: [],
            base: 0,
            score: 0,
            convergence: 1,
            reasons: [],
          });
        }
      }
    }
  }
  return out;
}
