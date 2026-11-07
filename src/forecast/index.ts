/**
 * The forecast (TASK-0015): for one birth chart and a stretch of time, past or future, every timing signal the five
 * layers give (zodiacal releasing, profections, the solar return, progressions and solar arcs, transits and
 * eclipses), weighed and ranked. It says when, and which part of life is emphasised; never what will happen
 * ("Timing activates potential; it does not create guaranteed events": knowledge/engine/temporal/timing_rules).
 */
import type { Chart } from "../types";
import { natalOf } from "./natal";
import { chironCovers } from "./chiron";
import { transits, TRANSIT_ORB } from "./transits";
import { progressions, PROGRESSION_ORB } from "./progressions";
import { attachTriggers, eclipseIndicators, ECLIPSE_ORB } from "./eclipses";
import { profections, releasing, solarReturns, RELEASING_YEAR_DAYS, type ReleasingYear } from "./timelords";
import { score } from "./score";
import { meaningsFor } from "./meanings";
import { NO_BIRTH_TIME, type Forecast, type Indicator } from "./types";

export interface ForecastRequest {
  readonly mode: "back" | "ahead";
  readonly from: string;
  readonly to: string;
  /** Where to cast the solar returns; the birthplace when absent. */
  readonly solarReturnAt?: { readonly latitude: number; readonly longitude: number; readonly label: string } | null;
  /** The length of zodiacal releasing's years: Valens's 360 days when absent. */
  readonly releasingYear?: ReleasingYear;
}

/** The longest stretch one forecast covers: twenty-five years. */
export const MAX_SPAN_DAYS = 25 * 366;

export function buildForecast(chart: Chart, request: ForecastRequest, now: Date = new Date()): Forecast {
  const natal = natalOf(chart);
  if (!natal.timeKnown) throw new Error(NO_BIRTH_TIME);
  const from = Date.parse(request.from);
  const to = Date.parse(request.to);
  if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) throw new Error("The forecast needs a start date before its end date.");
  if ((to - from) / 86_400_000 > MAX_SPAN_DAYS) throw new Error("A forecast covers twenty-five years at most.");
  if (to <= natal.birth.getTime()) throw new Error("The forecast ends before the birth.");

  const limits: string[] = [];
  if (!chironCovers(from, to)) limits.push("Transiting Chiron is computed from 1900 to 2100; this stretch goes beyond, so Chiron's transits are left out.");

  const place = request.solarReturnAt ?? { latitude: natal.latitude, longitude: natal.longitude, label: `${chart.birth.place} (birthplace)` };
  const years = profections(natal, from, to);
  const releasingYear = request.releasingYear ?? "valens";
  const spirit = releasing(natal, "spirit", from, to, releasingYear);
  const fortune = releasing(natal, "fortune", from, to, releasingYear);
  const returns = solarReturns(natal, from, to, place);

  const progressed = progressions(natal, from, to);
  const eclipsed = eclipseIndicators(natal, from, to);
  const all: Indicator[] = [...transits(natal, from, to), ...progressed.indicators, ...eclipsed.indicators];
  attachTriggers(natal, all, from, to);
  const ranked = score(all, natal, years, spirit);

  const ids = new Set<string>([
    "techniques/transits",
    "techniques/secondary_progressions",
    "techniques/solar_arc_directions",
    "techniques/eclipses",
    "techniques/lunations",
    "techniques/planetary_returns",
    "techniques/annual_profections",
    "techniques/solar_return",
    "techniques/zodiacal_releasing",
  ]);
  for (const ind of ranked) {
    if (ind.moverId) ids.add(ind.moverId);
    ids.add(ind.target.id);
    ids.add(`aspects/${ind.aspect}`);
    if (ind.target.house) ids.add(`houses/house_${ind.target.house}`);
  }
  for (const y of years) {
    ids.add(`houses/house_${y.house}`);
    ids.add(`signs/${y.sign.toLowerCase()}`);
    ids.add(`planets/${y.lord.toLowerCase()}`);
  }
  for (const p of [...spirit, ...fortune]) {
    ids.add(`houses/house_${p.house}`);
    ids.add(`signs/${p.sign.toLowerCase()}`);
  }

  return {
    chartId: chart.id,
    mode: request.mode,
    from: new Date(from).toISOString(),
    to: new Date(to).toISOString(),
    generatedAt: now.toISOString(),
    limits,
    years,
    solarReturns: returns,
    releasing: { spirit, fortune },
    milestones: [...progressed.milestones, ...eclipsed.milestones].sort((a, b) => a.date.localeCompare(b.date)),
    indicators: ranked,
    meanings: meaningsFor(ids),
    settings: {
      orbs: {
        transits: `${TRANSIT_ORB.approaching}° approaching, ${TRANSIT_ORB.separating}° separating`,
        progressions: `${PROGRESSION_ORB}°`,
        "solar arcs": `${PROGRESSION_ORB}°`,
        eclipses: `${ECLIPSE_ORB}°`,
      },
      solarReturnAt: place.label,
      releasingYear: releasingYear === "valens" ? `years of ${RELEASING_YEAR_DAYS.valens} days (Valens)` : `calendar years (${RELEASING_YEAR_DAYS.calendar} days)`,
    },
  };
}

export { NO_BIRTH_TIME } from "./types";
export type { Forecast } from "./types";
