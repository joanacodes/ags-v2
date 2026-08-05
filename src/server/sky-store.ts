/**
 * Current-sky snapshot (server-side).
 *
 * One FreeAstroAPI call captures the planets' absolute longitudes AND their
 * speeds (degrees/day). The client then extrapolates motion locally —
 * position(t) = pos + speed * elapsedDays — so the sky moves continuously
 * without ever polling the API. The snapshot is cached in memory and
 * refreshed at most every REFRESH_HOURS.
 */

export interface SkyBody {
  name: string;
  glyph: string;
  /** Absolute ecliptic longitude 0-360 at fetch time. */
  absPos: number;
  /** Degrees per day (negative = retrograde). */
  speedDegPerDay: number;
  retrograde: boolean;
}

export interface SkySnapshot {
  fetchedAt: string;
  bodies: SkyBody[];
  source: "freeastroapi";
}

const REFRESH_HOURS = 6;
const TIMEOUT_MS = 20_000;

const GLYPHS: Readonly<Record<string, string>> = {
  Sun: "☉", Moon: "☽", Mercury: "☿", Venus: "♀", Mars: "♂",
  Jupiter: "♃", Saturn: "♄", Uranus: "♅", Neptune: "♆", Pluto: "♇",
};

/** Mean daily motions (deg/day) — fallback when the API omits speeds. */
const MEAN_MOTION: Readonly<Record<string, number>> = {
  Sun: 0.9856, Moon: 13.1764, Mercury: 1.383, Venus: 1.2,
  Mars: 0.5240, Jupiter: 0.0831, Saturn: 0.0335, Uranus: 0.0117,
  Neptune: 0.006, Pluto: 0.004,
};

let cache: { snapshot: SkySnapshot; expiresAt: number } | null = null;

interface FaSkyPlanet {
  name?: string;
  abs_pos?: number;
  retrograde?: boolean;
  speed?: number;
  speed_deg_per_day?: number;
  daily_motion?: number;
}

function extractSpeed(planet: FaSkyPlanet, name: string): number {
  for (const value of [planet.speed, planet.speed_deg_per_day, planet.daily_motion]) {
    if (typeof value === "number" && Number.isFinite(value) && value !== 0) return value;
  }
  const mean = MEAN_MOTION[name] ?? 0.05;
  return planet.retrograde === true ? -mean : mean;
}

export type SkyOutcome =
  | { status: "ok"; snapshot: SkySnapshot }
  | { status: "not_configured" }
  | { status: "failed"; message: string };

export async function getCurrentSky(): Promise<SkyOutcome> {
  if (cache !== null && Date.now() < cache.expiresAt) {
    return { status: "ok", snapshot: cache.snapshot };
  }
  const apiKey = process.env.FREE_ASTRO_API_KEY?.trim();
  if (apiKey === undefined || apiKey === "") return { status: "not_configured" };

  const now = new Date();
  const body = {
    name: "Current Sky",
    year: now.getUTCFullYear(),
    month: now.getUTCMonth() + 1,
    day: now.getUTCDate(),
    hour: now.getUTCHours(),
    minute: now.getUTCMinutes(),
    time_known: true,
    // Planetary longitudes are location-independent; Greenwich anchors houses
    // we do not use.
    lat: 51.4779,
    lng: 0,
    tz_str: "UTC",
    house_system: "placidus",
    zodiac_type: "tropical",
    include_speed: true,
    include_minor_aspects: false,
    interpretation: { enable: false },
  };

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    const response = await fetch("https://api.freeastroapi.com/api/v1/natal/calculate", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": apiKey },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!response.ok) {
      const text = await response.text();
      return { status: "failed", message: `FreeAstroAPI ${response.status}: ${text.slice(0, 200)}` };
    }
    const data = (await response.json()) as { planets?: FaSkyPlanet[] };
    const bodies: SkyBody[] = [];
    for (const planet of data.planets ?? []) {
      const name = typeof planet.name === "string" ? planet.name : "";
      const glyph = GLYPHS[name];
      if (glyph === undefined || typeof planet.abs_pos !== "number") continue;
      bodies.push({
        name,
        glyph,
        absPos: ((planet.abs_pos % 360) + 360) % 360,
        speedDegPerDay: extractSpeed(planet, name),
        retrograde: planet.retrograde === true,
      });
    }
    if (bodies.length === 0) {
      return { status: "failed", message: "Sky snapshot returned no mappable planets." };
    }
    const snapshot: SkySnapshot = {
      fetchedAt: now.toISOString(),
      bodies,
      source: "freeastroapi",
    };
    cache = { snapshot, expiresAt: Date.now() + REFRESH_HOURS * 3600 * 1000 };
    return { status: "ok", snapshot };
  } catch (error) {
    return {
      status: "failed",
      message: error instanceof Error ? error.message : String(error),
    };
  }
}
