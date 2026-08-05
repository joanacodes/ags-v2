/**
 * FreeAstroAPI natal provider (TASK-0007, server-side only).
 *
 * Adapted from the audited `feature/knowledge-model` branch client, re-mapped
 * to the v2 Chart model. Requires FREE_ASTRO_API_KEY in the server
 * environment; without it, calculation is reported as "not configured" and
 * charts stay in the processing state.
 *
 * The provider owns calculation-domain data (sign rulers, orb formatting).
 * It produces facts only — interpretation stays in the engine (ADR-0001).
 */
import type {
  Aspect,
  AspectType,
  Chart,
  ChartPoint,
  Element,
  ExtraPointName,
  PointPosition,
  Modality,
  PlanetName,
  ZodiacSign,
} from "../../types";

const BASE_URL = "https://api.freeastroapi.com";
const NATAL_ENDPOINT = "/api/v1/natal/calculate";
const TIMEOUT_MS = 30_000;

/* ------------------------------ response ------------------------------ */

interface FaPlanet {
  name?: string;
  sign?: string;
  sign_id?: string;
  pos?: number;
  house?: number;
  retrograde?: boolean;
}
interface FaHouse {
  house?: number;
  sign?: string;
  sign_id?: string;
  pos?: number;
}
interface FaAngleDetails {
  sign?: string;
  sign_id?: string;
  pos?: number;
}
interface FaAspect {
  p1?: string;
  p2?: string;
  type?: string;
  orb?: number;
  is_major?: boolean;
  is_applying?: boolean;
}
interface FaResponse {
  planets?: FaPlanet[];
  /* extra bodies arrive in the same planets array with their own names */
  houses?: FaHouse[];
  angles_details?: {
    asc?: FaAngleDetails;
    mc?: FaAngleDetails;
    ic?: FaAngleDetails;
    dc?: FaAngleDetails;
    vertex?: FaAngleDetails & { house?: number };
  };
  aspects?: FaAspect[];
  dominants?: {
    dominant_element?: string;
    dominant_modality?: string;
  };
  dominants_profile?: {
    dominant_planets?: Array<{ name?: string; rank?: number }>;
  };
  confidence?: { overall?: string };
}

/* ------------------------------ mapping ------------------------------- */

const SIGNS: readonly ZodiacSign[] = [
  "Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo",
  "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces",
];
const PLANETS: readonly PlanetName[] = [
  "Sun", "Moon", "Mercury", "Venus", "Mars",
  "Jupiter", "Saturn", "Uranus", "Neptune", "Pluto",
];
const ASPECT_TYPES: readonly AspectType[] = [
  "conjunction", "sextile", "square", "trine", "opposition",
];
/** Modern sign rulers — calculation-domain reference data. */
const SIGN_RULERS: Readonly<Record<ZodiacSign, PlanetName>> = {
  Aries: "Mars", Taurus: "Venus", Gemini: "Mercury", Cancer: "Moon",
  Leo: "Sun", Virgo: "Mercury", Libra: "Venus", Scorpio: "Pluto",
  Sagittarius: "Jupiter", Capricorn: "Saturn", Aquarius: "Uranus",
  Pisces: "Neptune",
};

/** FreeAstroAPI abbreviates signs ("Tau", "Sag", "Cap"…) — decode both
 * common astrological and IAU three-letter codes. */
const SIGN_BY_CODE: Readonly<Record<string, ZodiacSign>> = {
  ari: "Aries", tau: "Taurus", gem: "Gemini",
  can: "Cancer", cnc: "Cancer",
  leo: "Leo", vir: "Virgo", lib: "Libra", sco: "Scorpio",
  sag: "Sagittarius", sgr: "Sagittarius",
  cap: "Capricorn",
  aqu: "Aquarius", aqr: "Aquarius",
  pis: "Pisces", psc: "Pisces",
};

function asSign(sign: unknown, signId?: unknown): ZodiacSign | undefined {
  // sign_id carries the full lowercase name — most reliable when present.
  if (typeof signId === "string" && signId.length > 0) {
    const fromId =
      signId.charAt(0).toUpperCase() + signId.slice(1).toLowerCase();
    const hit = SIGNS.find((s) => s === fromId);
    if (hit !== undefined) return hit;
  }
  if (typeof sign !== "string") return undefined;
  const lower = sign.toLowerCase();
  if (lower.length === 3 && SIGN_BY_CODE[lower] !== undefined) {
    return SIGN_BY_CODE[lower];
  }
  const normalized = sign.charAt(0).toUpperCase() + sign.slice(1).toLowerCase();
  return SIGNS.find((s) => s === normalized);
}
function asPlanet(value: unknown): PlanetName | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
  return PLANETS.find((p) => p === normalized);
}
function asPoint(value: unknown): ChartPoint | undefined {
  const planet = asPlanet(value);
  if (planet !== undefined) return planet;
  if (typeof value !== "string") return undefined;
  const upper = value.toUpperCase();
  if (upper === "ASC" || upper === "ASCENDANT") return "ASC";
  if (upper === "MC" || upper === "MIDHEAVEN") return "MC";
  if (upper === "DC" || upper === "DESCENDANT") return "DC";
  if (upper === "IC") return "IC";
  return undefined;
}

/** 17.2583 -> { degree: 17, minute: 15 } */
export function splitPosition(pos: number): { degree: number; minute: number } {
  const degree = Math.max(0, Math.min(29, Math.floor(pos)));
  const minute = Math.max(0, Math.min(59, Math.round((pos - Math.floor(pos)) * 60)));
  return minute === 60 ? { degree, minute: 59 } : { degree, minute };
}

/** 4.2 -> "4°12'" */
export function formatOrb(orb: number): string {
  const { degree, minute } = {
    degree: Math.floor(Math.abs(orb)),
    minute: Math.round((Math.abs(orb) - Math.floor(Math.abs(orb))) * 60),
  };
  return `${degree}°${String(Math.min(minute, 59)).padStart(2, "0")}'`;
}

/** Map a full FreeAstroAPI response onto the chart's calculated fields. */
export function mapResponseToChart(base: Chart, response: FaResponse): Chart {
  const planets: Chart["planets"] = [];
  for (const p of response.planets ?? []) {
    const planet = asPlanet(p.name);
    const sign = asSign(p.sign, p.sign_id);
    if (planet === undefined || sign === undefined || typeof p.pos !== "number") continue;
    const { degree, minute } = splitPosition(p.pos);
    planets.push({
      planet,
      sign,
      degree,
      minute,
      // 0 = no house placement (untimed charts omit houses per the API docs).
      house: typeof p.house === "number" && p.house >= 1 && p.house <= 12 ? p.house : 0,
      retrograde: p.retrograde === true,
    });
  }

  const houses: Chart["houses"] = [];
  for (const h of response.houses ?? []) {
    const sign = asSign(h.sign, h.sign_id);
    if (sign === undefined || typeof h.house !== "number" || typeof h.pos !== "number") continue;
    const { degree, minute } = splitPosition(h.pos);
    houses.push({ number: h.house, sign, degree, minute });
  }

  const angles: Chart["angles"] = [];
  const angleMap = [
    ["ASC", response.angles_details?.asc],
    ["MC", response.angles_details?.mc],
    ["DC", response.angles_details?.dc],
    ["IC", response.angles_details?.ic],
  ] as const;
  for (const [point, details] of angleMap) {
    const sign = asSign(details?.sign, details?.sign_id);
    if (details === undefined || sign === undefined || typeof details.pos !== "number") continue;
    const { degree, minute } = splitPosition(details.pos);
    angles.push({ point, sign, degree, minute });
  }

  const aspects: Aspect[] = [];
  for (const a of response.aspects ?? []) {
    const from = asPoint(a.p1);
    const to = asPoint(a.p2);
    const type = ASPECT_TYPES.find((t) => t === a.type?.toLowerCase());
    if (from === undefined || to === undefined || type === undefined) continue;
    if (a.is_major === false) continue;
    if (typeof a.orb !== "number") continue;
    aspects.push({
      id: `${from}-${type}-${to}`.toLowerCase(),
      type,
      from,
      to,
      orb: formatOrb(a.orb),
      applying: a.is_applying === true,
    });
  }

  const EXTRA_POINTS: Readonly<Record<string, ExtraPointName>> = {
    chiron: "Chiron",
    lilith: "Lilith",
    "north node": "North Node",
    "south node": "South Node",
    true_node: "North Node",
    mean_node: "North Node",
  };
  const points: PointPosition[] = [];
  for (const p of response.planets ?? []) {
    const name = typeof p.name === "string" ? p.name.toLowerCase() : "";
    const extra = EXTRA_POINTS[name];
    const sign = asSign(p.sign, p.sign_id);
    if (extra === undefined || sign === undefined || typeof p.pos !== "number") continue;
    if (points.some((existing) => existing.point === extra)) continue; // one node variant only
    const { degree, minute } = splitPosition(p.pos);
    points.push({
      point: extra,
      sign,
      degree,
      minute,
      house: typeof p.house === "number" && p.house >= 1 && p.house <= 12 ? p.house : 0,
      retrograde: p.retrograde === true,
    });
  }
  const vertexDetails = response.angles_details?.vertex;
  const vertexSign = asSign(vertexDetails?.sign, vertexDetails?.sign_id);
  if (vertexDetails !== undefined && vertexSign !== undefined && typeof vertexDetails.pos === "number") {
    const { degree, minute } = splitPosition(vertexDetails.pos);
    points.push({
      point: "Vertex",
      sign: vertexSign,
      degree,
      minute,
      house:
        typeof vertexDetails.house === "number" &&
        vertexDetails.house >= 1 &&
        vertexDetails.house <= 12
          ? vertexDetails.house
          : 0,
    });
  }

  const sun = planets.find((p) => p.planet === "Sun");
  const moon = planets.find((p) => p.planet === "Moon");
  const asc = angles.find((a) => a.point === "ASC");

  const dominantElement = ((): Element => {
    const value = response.dominants?.dominant_element ?? "";
    const normalized = value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
    return (["Fire", "Earth", "Air", "Water"] as Element[]).find((e) => e === normalized) ?? "Fire";
  })();
  const dominantModality = ((): Modality => {
    const value = response.dominants?.dominant_modality ?? "";
    const normalized = value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
    return (["Cardinal", "Fixed", "Mutable"] as Modality[]).find((m) => m === normalized) ?? "Cardinal";
  })();

  const dominantPlanets = (response.dominants_profile?.dominant_planets ?? [])
    .map((d) => asPlanet(d.name))
    .filter((p): p is PlanetName => p !== undefined)
    .slice(0, 3);

  const houseCounts = new Map<number, number>();
  for (const p of planets) houseCounts.set(p.house, (houseCounts.get(p.house) ?? 0) + 1);
  const strongestHouses = [...houseCounts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0] - b[0])
    .slice(0, 3)
    .map(([house]) => house);

  const confidenceScore = ((): number => {
    const overall = response.confidence?.overall;
    if (overall === "high") return 90;
    if (overall === "medium") return 70;
    if (overall === "low") return 45;
    return 60;
  })();

  const ascendantSign = asc?.sign ?? sun?.sign ?? "Aries";

  return {
    ...base,
    planets,
    points,
    houses,
    angles,
    aspects,
    summary: {
      sun: sun !== undefined
        ? { degree: sun.degree, minute: sun.minute, sign: sun.sign, house: sun.house }
        : base.summary.sun,
      moon: moon !== undefined
        ? { degree: moon.degree, minute: moon.minute, sign: moon.sign, house: moon.house }
        : base.summary.moon,
      ascendant: asc !== undefined
        ? { degree: asc.degree, minute: asc.minute, sign: asc.sign }
        : base.summary.ascendant,
      chartRuler: {
        planet: SIGN_RULERS[ascendantSign],
        position: ((): string => {
          const ruler = planets.find((p) => p.planet === SIGN_RULERS[ascendantSign]);
          return ruler !== undefined
            ? `${ruler.degree}°${String(ruler.minute).padStart(2, "0")}' ${ruler.sign}, House ${ruler.house}`
            : "See placements";
        })(),
      },
      dominantElement,
      dominantModality,
      dominantPlanets,
      strongestHouses,
      majorThemes: base.summary.majorThemes,
      insights: base.summary.insights,
    },
    status: "active",
    confidenceScore,
  };
}

/* ------------------------------ provider ------------------------------ */

export type CalculationOutcome =
  | { readonly status: "ok"; readonly chart: Chart }
  | { readonly status: "not_configured" }
  | { readonly status: "failed"; readonly message: string };

/** Calculate a chart's real placements from its birth data. */
export async function calculateChart(chart: Chart): Promise<CalculationOutcome> {
  const apiKey = process.env.FREE_ASTRO_API_KEY?.trim();
  if (apiKey === undefined || apiKey === "") return { status: "not_configured" };

  const [yearRaw, monthRaw, dayRaw] = chart.birth.date.split("-");
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const day = Number(dayRaw);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return { status: "failed", message: `Invalid birth date "${chart.birth.date}".` };
  }
  const [hourRaw, minuteRaw] = (chart.birth.time ?? "12:00").split(":");

  const body: Record<string, unknown> = {
    name: `${chart.person.firstName} ${chart.person.lastName}`.trim(),
    year,
    month,
    day,
    time_known: chart.birth.timeKnown,
    tz_str: chart.birth.timezone,
    house_system: chart.configuration.houseSystem.toLowerCase().replace(/\s+/g, "_"),
    zodiac_type: "tropical",
    response_format: "full",
    include_speed: true,
    include_dignity: true,
    include_minor_aspects: false,
    include_stelliums: true,
    include_dominants: true,
    dominants_method: "modern",
    include_features: ["chiron", "lilith", "true_node"],
    interpretation: { enable: false },
  };
  if (chart.birth.timeKnown) {
    body.hour = Number(hourRaw);
    body.minute = Number(minuteRaw);
  }
  if (chart.birth.latitude !== 0 || chart.birth.longitude !== 0) {
    body.lat = chart.birth.latitude;
    body.lng = chart.birth.longitude;
  } else {
    body.city = chart.birth.place;
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    const response = await fetch(`${BASE_URL}${NATAL_ENDPOINT}`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": apiKey },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!response.ok) {
      const text = await response.text();
      return {
        status: "failed",
        message: `FreeAstroAPI ${response.status}: ${text.slice(0, 240)}`,
      };
    }
    const data = (await response.json()) as FaResponse;
    const mapped = mapResponseToChart(chart, data);
    if (mapped.planets.length === 0) {
      const seen = (data.planets ?? [])
        .map((p) => `${String(p.name)}:${String(p.sign_id ?? p.sign)}`)
        .slice(0, 5)
        .join(", ");
      return {
        status: "failed",
        message: `Provider returned no mappable planets (saw: ${seen === "" ? "empty planets array" : seen}).`,
      };
    }
    return { status: "ok", chart: mapped };
  } catch (error) {
    return {
      status: "failed",
      message: error instanceof Error ? error.message : String(error),
    };
  }
}
