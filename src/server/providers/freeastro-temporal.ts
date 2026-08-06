/**
 * Temporal provider (TASK-0011): Saturn return, solar returns, secondary
 * progressions from FreeAstroAPI. Endpoint paths follow the documented
 * /api/v1/<feature>/calculate pattern (confirmed for natal and transits);
 * candidate paths are tried in order and API errors are surfaced verbatim
 * so mismatches are diagnosable in one glance.
 */
import type { Chart } from "@/types";

const BASE = "https://api.freeastroapi.com";
const TIMEOUT_MS = 25_000;

/** Nested natal block used by the progression/return API family. */
function nestedNatal(chart: Chart): Record<string, unknown> {
  const timeKnown = typeof chart.birth.time === "string" && chart.birth.time.length > 0;
  return {
    name: `${chart.person.firstName} ${chart.person.lastName}`,
    datetime: `${chart.birth.date} ${timeKnown ? chart.birth.time : "12:00"}`,
    time_known: timeKnown,
    location: {
      city: chart.birth.place,
      lat: chart.birth.latitude,
      lng: chart.birth.longitude,
      tz_str: chart.birth.timezone || "AUTO",
    },
  };
}

function natalBody(chart: Chart): Record<string, unknown> {
  const [year, month, day] = chart.birth.date.split("-").map(Number);
  const timeKnown = typeof chart.birth.time === "string" && chart.birth.time.length > 0;
  const [hour, minute] = timeKnown
    ? (chart.birth.time as string).split(":").map(Number)
    : [12, 0];
  return {
    name: `${chart.person.firstName} ${chart.person.lastName}`,
    year,
    month,
    day,
    hour,
    minute,
    time_known: timeKnown,
    lat: chart.birth.latitude,
    lng: chart.birth.longitude,
    tz_str: chart.birth.timezone,
    house_system: (chart.configuration.houseSystem ?? "Placidus").toLowerCase(),
    zodiac_type: "tropical",
    interpretation: { enable: false },
  };
}

export interface TemporalCallOutcome {
  ok: boolean;
  data?: unknown;
  error?: string;
}

async function post(
  paths: readonly string[],
  body: Record<string, unknown>,
): Promise<TemporalCallOutcome> {
  const apiKey = process.env.FREE_ASTRO_API_KEY?.trim();
  if (apiKey === undefined || apiKey === "") {
    return { ok: false, error: "FREE_ASTRO_API_KEY is not configured." };
  }
  let lastError = "No candidate endpoint responded.";
  for (const path of paths) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
      const response = await fetch(`${BASE}${path}`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-api-key": apiKey },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (response.ok) return { ok: true, data: await response.json() };
      const text = (await response.text()).slice(0, 300);
      lastError = `${path} -> ${response.status}: ${text}`;
      // 404 = wrong path, try the next candidate; other statuses are real errors
      if (response.status !== 404) return { ok: false, error: lastError };
    } catch (error) {
      lastError = `${path} -> ${error instanceof Error ? error.message : String(error)}`;
    }
  }
  return { ok: false, error: lastError };
}

/** Saturn return windows (transiting Saturn conjunct natal Saturn). */
export async function fetchSaturnReturn(chart: Chart): Promise<TemporalCallOutcome> {
  const location = {
    city: chart.birth.place,
    lat: chart.birth.latitude,
    lng: chart.birth.longitude,
    timezone: chart.birth.timezone || "AUTO",
  };
  const searchStart = `${new Date().toISOString().slice(0, 10)}T00:00:00Z`;
  const call = (mode: "previous" | "next") =>
    post(["/api/v1/western/returns/calculate"], {
      natal: { ...nestedNatal(chart), location },
      return_target: {
        body: "saturn",
        search_start: searchStart,
        selection_mode: mode,
        location,
      },
    });
  const [previous, next] = await Promise.all([call("previous"), call("next")]);
  if (!previous.ok && !next.ok) return next;
  return { ok: true, data: { previous: previous.data ?? null, next: next.data ?? null } };
}

/** Solar return chart for the birthday year starting `year`. */
export function fetchSolarReturn(chart: Chart, year: number): Promise<TemporalCallOutcome> {
  const timeKnown = typeof chart.birth.time === "string" && chart.birth.time.length > 0;
  const location = {
    city: chart.birth.place,
    lat: chart.birth.latitude,
    lng: chart.birth.longitude,
    timezone: chart.birth.timezone || "AUTO",
  };
  return post(["/api/v1/western/solar/calculate"], {
    natal: { ...nestedNatal(chart), location },
    solar_return: {
      year,
      // v1: return computed for the birth place (current residence later).
      location,
      ...(timeKnown ? {} : { calculation_mode: "uncertainty_range" }),
    },
  });
}

/** Secondary progressions as of `date` (YYYY-MM-DD). */
export function fetchProgressions(chart: Chart, date: string): Promise<TemporalCallOutcome> {
  return post(["/api/v1/western/progressions/secondary"], {
    natal: nestedNatal(chart),
    secondary_progression: { target_date: date },
  });
}

/** Progressed sign/house changes inside a window — the "evolution" feed. */
export function fetchProgressionIngresses(
  chart: Chart,
  from: string,
  to: string,
): Promise<TemporalCallOutcome> {
  return post(["/api/v1/western/progressions/secondary/exact-ingresses"], {
    natal: nestedNatal(chart),
    secondary_progression: { window: { start: from, end: to }, from, to, start: from, end: to },
  });
}
