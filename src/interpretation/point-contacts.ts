/**
 * Aspects to Chiron and Lilith, computed from the chart's own positions.
 *
 * The astrology provider only returns aspects between planets and angles,
 * so the contacts that matter most for the deep readings (Chiron square
 * Moon, Lilith conjunct Venus…) are measured here from ecliptic longitudes.
 * Deterministic and pure — unit-tested.
 */
import type { AspectType, Chart, Placement } from "../types";

export interface PointContact {
  readonly from: string;
  readonly to: string;
  readonly type: AspectType;
  /** Distance from exact, in degrees. */
  readonly orb: number;
}

/** Tighter orbs than for planets: these points speak loudest when close. */
const CONTACT_ASPECTS: readonly { type: AspectType; angle: number; orb: number }[] = [
  { type: "conjunction", angle: 0, orb: 6 },
  { type: "opposition", angle: 180, orb: 6 },
  { type: "square", angle: 90, orb: 5 },
  { type: "trine", angle: 120, orb: 5 },
  { type: "sextile", angle: 60, orb: 3 },
];

const SIGNS = [
  "Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo",
  "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces",
];

function longitude(p: Placement): number {
  return SIGNS.indexOf(p.sign) * 30 + p.degree + p.minute / 60;
}

export function formatOrb(orb: number): string {
  const degrees = Math.floor(orb);
  const minutes = Math.round((orb - degrees) * 60);
  return minutes === 60 ? `${degrees + 1}°00'` : `${degrees}°${String(minutes).padStart(2, "0")}'`;
}

/** Contacts from each of `sources` (e.g. Chiron, Lilith) to every planet, angle and other source. */
export function pointContacts(
  chart: Pick<Chart, "planets" | "angles" | "points">,
  sources: readonly string[],
): PointContact[] {
  const bodies: { name: string; at: number }[] = [
    ...chart.planets.map((p) => ({ name: p.planet as string, at: longitude(p) })),
    ...chart.angles
      .filter((a) => a.point === "ASC" || a.point === "MC")
      .map((a) => ({ name: a.point as string, at: longitude(a) })),
    ...(chart.points ?? [])
      .filter((p) => p.point === "Chiron" || p.point === "Lilith")
      .map((p) => ({ name: p.point as string, at: longitude(p) })),
  ];
  const contacts: PointContact[] = [];
  const seen = new Set<string>();
  for (const source of sources) {
    const from = bodies.find((b) => b.name === source);
    if (from === undefined) continue;
    for (const target of bodies) {
      if (target.name === from.name) continue;
      const pair = [from.name, target.name].sort().join("|");
      if (seen.has(pair)) continue;
      let distance = Math.abs(from.at - target.at) % 360;
      if (distance > 180) distance = 360 - distance;
      for (const aspect of CONTACT_ASPECTS) {
        const orb = Math.abs(distance - aspect.angle);
        if (orb <= aspect.orb) {
          seen.add(pair);
          contacts.push({ from: from.name, to: target.name, type: aspect.type, orb });
          break;
        }
      }
    }
  }
  return contacts.sort((a, b) => a.orb - b.orb);
}
