/**
 * Synastry: how two birth charts interact.
 *
 * Deterministic and pure (unit-tested):
 * - the contacts between the charts: aspects from one person's planets,
 *   angles and points to the other's;
 * - the house overlays: where one person's planets fall in the other's
 *   houses (only when that person's birth time is known);
 * - knowledge-grounded sentences for the AI layer, composed only from the
 *   knowledge pack, like the natal readings.
 */
import { aspectKnowledgeKey, houseKnowledgeKey, pointKnowledgeKey } from "../grammar/rules/mapping";
import type { KnowledgeRegistry } from "../knowledge/registry";
import type { KnowledgeRecord } from "../knowledge/types";
import type { AspectType, Chart, Placement } from "../types";
import { describeDomains, describeFunction, type ComposedGroup, type ComposedSentence } from "./composer";
import { formatOrb } from "./point-contacts";

export type SynastryChart = Pick<Chart, "planets" | "angles" | "houses" | "points" | "birth">;

type BodyClass = "luminary" | "personal" | "social" | "outer" | "angle" | "point";

interface Body {
  readonly name: string;
  readonly at: number;
  readonly cls: BodyClass;
}

export interface SynastryContact {
  /** Body of the first person. */
  readonly a: string;
  /** Body of the second person. */
  readonly b: string;
  readonly type: AspectType;
  /** Distance from exact, in degrees. */
  readonly orb: number;
  /** 1 = exact, 0 = at the edge of the orb. */
  readonly strength: number;
}

export interface HouseOverlay {
  readonly point: string;
  readonly house: number;
}

export interface SynastryOverview {
  readonly contacts: readonly SynastryContact[];
  /** First person's planets in the second person's houses. */
  readonly aInB: readonly HouseOverlay[];
  /** Second person's planets in the first person's houses. */
  readonly bInA: readonly HouseOverlay[];
  readonly aTimeKnown: boolean;
  readonly bTimeKnown: boolean;
}

const SIGNS = [
  "Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo",
  "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces",
];

const PLANET_CLASS: Readonly<Record<string, BodyClass>> = {
  Sun: "luminary",
  Moon: "luminary",
  Mercury: "personal",
  Venus: "personal",
  Mars: "personal",
  Jupiter: "social",
  Saturn: "social",
  Uranus: "outer",
  Neptune: "outer",
  Pluto: "outer",
};

/** Widest orb by kind of body; a pair uses the wider of its two. */
const CLASS_ORB: Readonly<Record<BodyClass, number>> = {
  luminary: 8,
  personal: 6,
  social: 5,
  outer: 4,
  angle: 5,
  point: 3,
};

const ASPECTS: readonly { type: AspectType; angle: number; factor: number }[] = [
  { type: "conjunction", angle: 0, factor: 1 },
  { type: "opposition", angle: 180, factor: 1 },
  { type: "trine", angle: 120, factor: 0.85 },
  { type: "square", angle: 90, factor: 0.85 },
  { type: "sextile", angle: 60, factor: 0.6 },
];

const DISPLAY: Readonly<Record<string, string>> = { ASC: "Ascendant", MC: "Midheaven" };

/** "ASC" -> "Ascendant", others unchanged. */
export function displayBody(name: string): string {
  return DISPLAY[name] ?? name;
}

function longitude(p: Placement): number {
  return SIGNS.indexOf(p.sign) * 30 + p.degree + p.minute / 60;
}

/** Birth time known: houses and angles can be read. */
export function hasBirthTime(chart: SynastryChart): boolean {
  return chart.birth?.timeKnown !== false && (chart.angles?.length ?? 0) > 0;
}

function bodiesOf(chart: SynastryChart, withAngles: boolean): Body[] {
  const bodies: Body[] = chart.planets
    .filter((p) => PLANET_CLASS[p.planet] !== undefined)
    .map((p) => ({ name: p.planet as string, at: longitude(p), cls: PLANET_CLASS[p.planet] }));
  if (withAngles) {
    for (const a of chart.angles ?? []) {
      if (a.point === "ASC" || a.point === "MC") bodies.push({ name: a.point, at: longitude(a), cls: "angle" });
    }
  }
  for (const p of chart.points ?? []) {
    if (p.point === "Chiron" || p.point === "Lilith" || p.point === "North Node") {
      bodies.push({ name: p.point, at: longitude(p), cls: "point" });
    }
  }
  return bodies;
}

/** Only pairs where at least one side is personal: outer-to-outer contacts are shared by a whole generation. */
function meaningfulPair(x: BodyClass, y: BodyClass): boolean {
  const personal = (c: BodyClass) => c === "luminary" || c === "personal" || c === "angle";
  return personal(x) || personal(y);
}

/** Aspects between the two charts, strongest first. */
export function synastryContacts(a: SynastryChart, b: SynastryChart, max = 30): SynastryContact[] {
  const fromA = bodiesOf(a, hasBirthTime(a));
  const fromB = bodiesOf(b, hasBirthTime(b));
  const contacts: SynastryContact[] = [];
  for (const x of fromA) {
    for (const y of fromB) {
      if (!meaningfulPair(x.cls, y.cls)) continue;
      let distance = Math.abs(x.at - y.at) % 360;
      if (distance > 180) distance = 360 - distance;
      const widest = Math.max(CLASS_ORB[x.cls], CLASS_ORB[y.cls]);
      for (const aspect of ASPECTS) {
        const allowed = widest * aspect.factor;
        const orb = Math.abs(distance - aspect.angle);
        if (orb <= allowed) {
          contacts.push({ a: x.name, b: y.name, type: aspect.type, orb, strength: 1 - orb / allowed });
          break;
        }
      }
    }
  }
  return contacts.sort((p, q) => q.strength - p.strength || p.orb - q.orb).slice(0, max);
}

/** House (1-12) a longitude falls in, from the 12 cusp longitudes. */
export function houseOf(at: number, cusps: readonly number[]): number {
  for (let i = 0; i < 12; i += 1) {
    const start = cusps[i];
    const end = cusps[(i + 1) % 12];
    const span = (end - start + 360) % 360;
    const offset = (at - start + 360) % 360;
    if (offset < span) return i + 1;
  }
  return 1;
}

/** Where `from`'s planets and points fall in `into`'s houses (needs `into`'s birth time). */
export function houseOverlays(from: SynastryChart, into: SynastryChart): HouseOverlay[] {
  const houses = [...(into.houses ?? [])].sort((p, q) => p.number - q.number);
  if (!hasBirthTime(into) || houses.length < 12) return [];
  const cusps = houses.map(longitude);
  return bodiesOf(from, false).map((body) => ({ point: body.name, house: houseOf(body.at, cusps) }));
}

export function synastryOverview(a: SynastryChart, b: SynastryChart): SynastryOverview {
  return {
    contacts: synastryContacts(a, b),
    aInB: houseOverlays(a, b),
    bInA: houseOverlays(b, a),
    aTimeKnown: hasBirthTime(a),
    bTimeKnown: hasBirthTime(b),
  };
}

/* ----------------------------- composition ---------------------------- */

function lookup(registry: KnowledgeRegistry, key: string): KnowledgeRecord | undefined {
  const resolution = registry.resolve(key);
  return resolution.status === "resolved" ? resolution.record : undefined;
}

function bodyPhrase(registry: KnowledgeRegistry, body: string): { text: string | undefined; key: string } {
  const key = pointKnowledgeKey(body);
  const record = lookup(registry, key);
  const fn = record !== undefined ? describeFunction(record) : undefined;
  if (fn === undefined) return { text: undefined, key };
  const isAngle = body === "ASC" || body === "MC";
  return { text: isAngle ? `the ${displayBody(body)}'s function is to ${fn}` : `${body} ${fn}`, key };
}

export function contactLabel(nameA: string, nameB: string, c: SynastryContact): string {
  return `${nameA}'s ${displayBody(c.a)} ${c.type} ${nameB}'s ${displayBody(c.b)}`;
}

export function overlayLabel(owner: string, other: string, o: HouseOverlay): string {
  return `${owner}'s ${displayBody(o.point)} in ${other}'s House ${o.house}`;
}

/** The synastry material as knowledge-grounded sentences, grouped like the natal material. */
export function composeSynastry(
  nameA: string,
  nameB: string,
  overview: SynastryOverview,
  registry: KnowledgeRegistry,
): ComposedGroup[] {
  const groups: ComposedGroup[] = [];

  const contactItems: ComposedSentence[] = overview.contacts.map((c, index) => {
    const a = bodyPhrase(registry, c.a);
    const b = bodyPhrase(registry, c.b);
    const aspectKey = aspectKnowledgeKey(c.type);
    const aspectRecord = lookup(registry, aspectKey);
    const aspectFn = aspectRecord !== undefined ? describeFunction(aspectRecord) : undefined;
    const parts = [a.text, b.text, aspectFn !== undefined ? `the ${c.type} ${aspectFn}` : undefined]
      .filter((part): part is string => part !== undefined);
    const label = contactLabel(nameA, nameB, c);
    return {
      matchId: `syn-contact-${index}`,
      structure: "synastry_contact",
      label,
      sentence: `${label} (orb ${formatOrb(c.orb)})${parts.length > 0 ? ` — ${parts.join("; ")}` : ""}.`,
      knowledgeUsed: [a.key, b.key, aspectKey],
      sourceFactIds: [],
    };
  });
  if (contactItems.length > 0) {
    groups.push({ structure: "synastry_contact", title: "Contacts between the two charts", items: contactItems });
  }

  const overlayGroup = (owner: string, other: string, overlays: readonly HouseOverlay[], id: string) => {
    if (overlays.length === 0) return;
    const items: ComposedSentence[] = overlays.map((o, index) => {
      const body = bodyPhrase(registry, o.point);
      const houseKey = houseKnowledgeKey(o.house);
      const houseRecord = lookup(registry, houseKey);
      const context = houseRecord !== undefined ? describeDomains(houseRecord, 3) : undefined;
      const label = overlayLabel(owner, other, o);
      const parts = [
        body.text,
        context !== undefined ? `in ${other}'s chart it operates in the context of ${context}` : undefined,
      ].filter((part): part is string => part !== undefined);
      return {
        matchId: `syn-${id}-${index}`,
        structure: `synastry_overlay_${id}`,
        label,
        sentence: `${label}${parts.length > 0 ? ` — ${parts.join("; ")}` : ""}.`,
        knowledgeUsed: [body.key, houseKey],
        sourceFactIds: [],
      };
    });
    groups.push({ structure: `synastry_overlay_${id}`, title: `${owner}'s planets in ${other}'s houses`, items });
  };
  overlayGroup(nameA, nameB, overview.aInB, "a_in_b");
  overlayGroup(nameB, nameA, overview.bInA, "b_in_a");
  return groups;
}

/* ------------------------------ identity ------------------------------ */

/** Short stable hash of a chart id, so the stored slug stays short. */
function fnv1a(text: string, seed: number): string {
  let hash = seed >>> 0;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

/** Leading "_" = private record: the readee share function never returns it. */
export const SYNASTRY_SLUG_PREFIX = "_synastry-";

/** Readings slug for a synastry, stored under the pair's first chart. */
export function synastrySlug(partnerChartId: string): string {
  return `${SYNASTRY_SLUG_PREFIX}${fnv1a(partnerChartId, 0x811c9dc5)}${fnv1a(partnerChartId, 0x01000193)}`;
}

export function isSynastrySlug(slug: string): boolean {
  return slug.startsWith(SYNASTRY_SLUG_PREFIX);
}

/**
 * Which chart of the pair stores the synastry. A sample chart can't store
 * anything, so the real chart wins; otherwise a stable order, so the same
 * two people always share one synastry.
 */
export function orderPair(a: string, b: string, isSample: (id: string) => boolean): [string, string] {
  if (isSample(a) && !isSample(b)) return [b, a];
  if (isSample(b) && !isSample(a)) return [a, b];
  return a <= b ? [a, b] : [b, a];
}
