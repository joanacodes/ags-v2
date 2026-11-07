/**
 * The owner's rule: there is always a birth time, or no reading (for the forecast on 2026-11-01, for every reading on
 * 2026-11-02). Without the time the Ascendant and the houses are unknown, and a reading would rest on half a chart.
 * A chart without a time can still be kept, for the day the time is found; nothing is read from it until then.
 */
import type { Chart } from "../types";

export function hasBirthTime(chart: Pick<Chart, "birth">): boolean {
  return chart.birth.timeKnown === true && typeof chart.birth.time === "string" && chart.birth.time.trim() !== "";
}

export const NO_BIRTH_TIME_READING = "A reading needs the birth time: without it there is no reading. Add the time to the birth chart first.";
export const NO_BIRTH_TIME_SYNASTRY = "A synastry needs both birth times: without them there is no reading. Add the missing time to the birth chart first.";
