/**
 * The sky table, from FreeAstroAPI: one chart a day for the coming 120 days (cached in Storage, so a
 * day is asked once), scanned for ingresses (a body changing sign), stations (its speed changing sign)
 * and lunations (the Moon 0° or 180° from the Sun). Each event found between two days is placed by
 * interpolation, then refined with one more chart at that moment (a Newton step on the body's own
 * speed), which puts it within minutes. Rows the launch plan typed in are confirmed rather than
 * duplicated: the plan is their first source, the scan their second. Eclipses come from NASA's
 * catalogue and are kept only when the scan finds their new or full moon.
 */
import type { AgentContext } from "../agents/context";
import { SkipRun, withRun } from "../run";
import type { SkyRow } from "../store/rows";
import type { NewSky } from "../store/store";
import { addDays, parisDate, parisTime } from "../time";
import { ECLIPSES, ECLIPSE_SOURCE } from "./eclipses";

export interface BodyPosition {
  readonly key: string;
  /** Ecliptic longitude, 0–360 (tropical). */
  readonly lon: number;
  /** Degrees a day; negative when retrograde. */
  readonly speed: number;
}

export interface Sample {
  readonly at: string;
  readonly bodies: readonly BodyPosition[];
}

export type Ephemeris = (at: Date) => Promise<BodyPosition[]>;

export const SIGNS = ["Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo", "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces"] as const;
const NAMES: Record<string, string> = { sun: "Sun", moon: "Moon", mercury: "Mercury", venus: "Venus", mars: "Mars", jupiter: "Jupiter", saturn: "Saturn", uranus: "Uranus", neptune: "Neptune", pluto: "Pluto", chiron: "Chiron" };
/** The Moon changes sign every two and a half days: its ingresses would drown the table. */
const INGRESS_BODIES = ["sun", "mercury", "venus", "mars", "jupiter", "saturn", "uranus", "neptune", "pluto", "chiron"];
const STATION_BODIES = ["mercury", "venus", "mars", "jupiter", "saturn", "uranus", "neptune", "pluto", "chiron"];
const DAY = 86400_000;
export const SCAN_SOURCE = "FreeAstroAPI scan";

const wrap360 = (x: number) => ((x % 360) + 360) % 360;
const wrap180 = (x: number) => wrap360(x + 180) - 180;
export const signOf = (lon: number) => SIGNS[Math.floor(wrap360(lon) / 30)]!;
const bodyIn = (s: Sample, key: string) => s.bodies.find((b) => b.key === key);

export interface Candidate {
  readonly kind: "ingress" | "station" | "lunation";
  readonly body: string;
  readonly at: Date;
  /** What the refinement aims at: the sign boundary, a speed of zero, or the Sun–Moon angle. */
  readonly target: number;
  readonly detail: "enters" | "retrograde" | "direct" | "new" | "full";
  /** Change of speed a day, for stations (the Newton step needs the slope). */
  readonly slope?: number;
}

/** Events between consecutive daily samples, placed by straight-line interpolation. */
export function scanSamples(samples: readonly Sample[]): Candidate[] {
  const out: Candidate[] = [];
  const sorted = [...samples].sort((a, b) => a.at.localeCompare(b.at));
  for (let i = 1; i < sorted.length; i++) {
    const a = sorted[i - 1]!;
    const b = sorted[i]!;
    const t0 = Date.parse(a.at);
    const span = Date.parse(b.at) - t0;
    for (const key of INGRESS_BODIES) {
      const pa = bodyIn(a, key);
      const pb = bodyIn(b, key);
      if (!pa || !pb) continue;
      const d = wrap180(pb.lon - pa.lon);
      const signA = Math.floor(wrap360(pa.lon) / 30);
      const signB = Math.floor(wrap360(pa.lon + d) / 30);
      if (signA === signB || d === 0) continue;
      // Forward, the boundary is the next sign's start; backward (retrograde), this sign's own start.
      const boundary = d > 0 ? (signA + 1) * 30 : signA * 30;
      const f = wrap180(boundary - pa.lon) / d;
      out.push({ kind: "ingress", body: key, at: new Date(t0 + f * span), target: wrap360(boundary), detail: "enters" });
    }
    for (const key of STATION_BODIES) {
      const pa = bodyIn(a, key);
      const pb = bodyIn(b, key);
      if (!pa || !pb || Math.sign(pa.speed) === Math.sign(pb.speed) || pa.speed === 0) continue;
      const f = pa.speed / (pa.speed - pb.speed);
      out.push({ kind: "station", body: key, at: new Date(t0 + f * span), target: 0, detail: pb.speed < 0 ? "retrograde" : "direct", slope: ((pb.speed - pa.speed) * DAY) / span });
    }
    const sa = bodyIn(a, "sun");
    const sb = bodyIn(b, "sun");
    const ma = bodyIn(a, "moon");
    const mb = bodyIn(b, "moon");
    if (sa && sb && ma && mb) {
      const ea = wrap360(ma.lon - sa.lon);
      const step = wrap360(wrap360(mb.lon - sb.lon) - ea);
      for (const [target, detail] of [[0, "new"], [180, "full"]] as const) {
        const need = wrap360(target - ea);
        if (need > 0 && need <= step) out.push({ kind: "lunation", body: "moon", at: new Date(t0 + (need / step) * span), target, detail });
      }
    }
  }
  return out;
}

/** One more chart at the estimated moment, and one Newton step on the body's speed. */
export async function refine(c: Candidate, ephemeris: Ephemeris): Promise<{ at: Date; lon: number; sign: string }> {
  const bodies = await ephemeris(c.at);
  const p = bodies.find((b) => b.key === c.body);
  if (!p) return { at: c.at, lon: NaN, sign: "" };
  let days = 0;
  if (c.kind === "ingress" && p.speed !== 0) days = wrap180(c.target - p.lon) / p.speed;
  if (c.kind === "station" && c.slope) days = -p.speed / c.slope;
  if (c.kind === "lunation") {
    const sun = bodies.find((b) => b.key === "sun");
    if (sun) {
      const rate = p.speed - sun.speed;
      if (rate !== 0) days = wrap180(c.target - wrap360(p.lon - sun.lon)) / rate;
    }
  }
  // A step longer than a day means the first guess was poor: keep the guess rather than trust it.
  if (!Number.isFinite(days) || Math.abs(days) > 1) days = 0;
  const at = new Date(c.at.getTime() + days * DAY);
  const lon = wrap360(p.lon + p.speed * days);
  return { at, lon, sign: c.kind === "ingress" ? signOf(c.target + (p.speed >= 0 ? 0.01 : -0.01)) : signOf(lon) };
}

export function eventText(c: Candidate, sign: string, lon: number): string {
  const name = NAMES[c.body] ?? c.body;
  if (c.kind === "lunation") return `${c.detail === "new" ? "New" : "Full"} Moon in ${sign}`;
  if (c.kind === "station") return `${name} turns ${c.detail} at ${Math.floor(wrap360(lon) % 30)}° ${sign}`;
  return `${c.body === "sun" ? "The Sun" : name} enters ${sign}`;
}

/** FreeAstroAPI's natal chart for a moment: the same request the site's live sky makes. */
export function freeAstroEphemeris(apiKey: string, fetchImpl: typeof fetch = fetch, endpoint = "https://api.freeastroapi.com/api/v1/natal/calculate"): Ephemeris {
  return async (at: Date) => {
    const res = await fetchImpl(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json", "user-agent": "The Astro Study Studio (astrostudy.co.uk) - sky table", "x-api-key": apiKey },
      body: JSON.stringify({
        name: "The sky",
        year: at.getUTCFullYear(),
        month: at.getUTCMonth() + 1,
        day: at.getUTCDate(),
        hour: at.getUTCHours(),
        minute: at.getUTCMinutes(),
        time_known: true,
        lat: 51.4779,
        lng: 0,
        tz_str: "UTC",
        house_system: "placidus",
        zodiac_type: "tropical",
        include_speed: true,
        include_minor_aspects: false,
        include_features: ["chiron", "lilith"],
        interpretation: { enable: false },
      }),
    });
    if (!res.ok) throw new Error(`FreeAstroAPI answered ${res.status}`);
    const data = (await res.json()) as { planets?: { name?: string; abs_pos?: number; sign_id?: string; pos?: number; speed?: number; speed_deg_per_day?: number; daily_motion?: number; retrograde?: boolean }[] };
    const out: BodyPosition[] = [];
    for (const p of data.planets ?? []) {
      const key = String(p.name ?? "").toLowerCase();
      if (!NAMES[key] || out.some((b) => b.key === key)) continue;
      let lon = typeof p.abs_pos === "number" ? p.abs_pos : NaN;
      if (!Number.isFinite(lon)) {
        const sign = SIGNS.findIndex((s) => s.toLowerCase() === String(p.sign_id ?? "").toLowerCase());
        if (sign >= 0 && typeof p.pos === "number") lon = sign * 30 + p.pos;
      }
      const speed = [p.speed, p.speed_deg_per_day, p.daily_motion].find((v): v is number => typeof v === "number" && Number.isFinite(v));
      if (!Number.isFinite(lon) || speed === undefined) continue;
      out.push({ key, lon: wrap360(lon), speed });
    }
    if (!out.some((b) => b.key === "sun") || !out.some((b) => b.key === "moon")) throw new Error("FreeAstroAPI answered without the Sun and Moon");
    return out;
  };
}

const SAMPLES_PATH = "sky/samples.json";
/** Charts asked in one run at most: the first run fills 120 days, later ones add a day or two. */
const MAX_CALLS = 160;

export async function runSky(ctx: AgentContext, opts: { ephemeris?: Ephemeris } = {}) {
  const { store, settings, storage, now } = ctx;
  return withRun(store, { agent: "sky", trigger: ctx.trigger }, async (log) => {
    const conf = settings.get("input-site");
    const key = (process.env.FREE_ASTRO_API_KEY ?? "").trim();
    const ephemeris = opts.ephemeris ?? (key ? freeAstroEphemeris(key) : null);
    if (!ephemeris) throw new SkipRun("skipped", "FREE_ASTRO_API_KEY isn't set: the sky table keeps the launch plan's dates");

    let cache: Record<string, Sample> = {};
    if (await storage.exists(SAMPLES_PATH)) {
      try {
        cache = JSON.parse(new TextDecoder().decode(await storage.download(SAMPLES_PATH))) as Record<string, Sample>;
      } catch {
        cache = {};
      }
    }
    const today = parisDate(now);
    const days = Array.from({ length: conf.sky_days + 1 }, (_, i) => addDays(today, i));
    let calls = 0;
    for (const day of days) {
      if (cache[day]) continue;
      if (calls >= MAX_CALLS) break;
      const at = new Date(`${day}T12:00:00Z`);
      cache[day] = { at: at.toISOString(), bodies: await ephemeris(at) };
      calls += 1;
    }
    // Days already past are dropped from the cache; the table keeps their events.
    for (const day of Object.keys(cache)) if (day < addDays(today, -1)) delete cache[day];
    await storage.upload(SAMPLES_PATH, new TextEncoder().encode(JSON.stringify(cache)), "application/json");

    const samples = days.map((d) => cache[d]).filter((s): s is Sample => !!s);
    const candidates = scanSamples(samples);
    const existing = await store.sky({ from: addDays(today, -2), to: addDays(today, conf.sky_days + 2) });
    const rows: NewSky[] = [];
    const lunations: { at: Date; detail: string; sign: string }[] = [];
    for (const c of candidates) {
      const fine = await refine(c, ephemeris);
      calls += 1;
      const sign = fine.sign || signOf(fine.lon);
      if (c.kind === "lunation") lunations.push({ at: fine.at, detail: c.detail, sign });
      rows.push(mergeWithTyped(existing, {
        date: parisDate(fine.at),
        time_paris: parisTime(fine.at),
        kind: c.kind,
        body: NAMES[c.body] ?? c.body,
        sign,
        degree: Number.isFinite(fine.lon) ? Math.round((wrap360(fine.lon) % 30) * 100) / 100 : null,
        event: eventText(c, sign, fine.lon),
        source1: SCAN_SOURCE,
        source2: null,
        created_by: "sky",
      }));
    }
    let unconfirmed = 0;
    for (const e of ECLIPSES) {
      const at = new Date(e.at);
      if (parisDate(at) < today || parisDate(at) > days[days.length - 1]!) continue;
      const match = lunations.find((l) => Math.abs(l.at.getTime() - at.getTime()) < 6 * 3600_000 && l.detail === (e.type === "solar" ? "new" : "full"));
      if (!match) {
        unconfirmed += 1;
        log.note(`the ${e.kind} ${e.type} eclipse of ${parisDate(at)} has no matching ${e.type === "solar" ? "new" : "full"} moon in the scan: not written`);
        continue;
      }
      const kind = e.kind.charAt(0).toUpperCase() + e.kind.slice(1);
      rows.push({
        date: parisDate(at),
        time_paris: parisTime(at),
        kind: "eclipse",
        body: e.type === "solar" ? "Sun" : "Moon",
        sign: match.sign,
        degree: null,
        event: `${kind} ${e.type} eclipse in ${match.sign}`,
        source1: ECLIPSE_SOURCE,
        source2: `${SCAN_SOURCE}: the ${match.detail} moon at ${parisTime(match.at)} Paris`,
        created_by: "sky",
      });
    }
    const written = await store.upsertSky(rows);
    log.count("studio_sky", written);
    log.note(`${calls} charts asked, ${candidates.length} events found, ${written} rows written${unconfirmed ? `, ${unconfirmed} eclipses unconfirmed` : ""}`);
    return { outcome: "ok" as const };
  });
}

/**
 * A scanned event the launch plan already typed in (same kind and body, within a day) keeps the plan's
 * date and wording, so the row is updated rather than doubled, and gains the scan as its second source.
 */
export function mergeWithTyped(existing: readonly SkyRow[], row: NewSky): NewSky {
  const day = Date.parse(`${row.date}T12:00:00Z`);
  const typed = existing.find((e) => e.kind === row.kind && e.body.toLowerCase() === row.body.toLowerCase() && e.source1 !== SCAN_SOURCE && Math.abs(Date.parse(`${e.date}T12:00:00Z`) - day) <= DAY);
  if (!typed) return row;
  return {
    ...row,
    date: typed.date,
    event: typed.event,
    time_paris: typed.time_paris ?? row.time_paris,
    sign: typed.sign ?? row.sign,
    source1: typed.source1,
    // A row the plan already had from two sources keeps them; an approximate one gains the scan.
    source2: typed.source2 ?? `${SCAN_SOURCE}: ${row.date} ${row.time_paris ?? ""} Paris`.trim(),
    created_by: typed.created_by,
  };
}
