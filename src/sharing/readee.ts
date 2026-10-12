/**
 * What a readee (the person a chart was made for) may see, and how their
 * share-link password works.
 *
 * - The password is their birth date as 8 digits, month first: MMDDYYYY.
 * - Shared data is stripped of everything technical or private to the
 *   astrologer: AI model, configuration, notes, statuses, scores.
 *
 * Pure functions: used by the share routes and the readee page.
 */
import type { Chart, Reading } from "../types";

/** "1990-03-14" (stored ISO date) → "03141990" (MMDDYYYY). Null if not a valid date. */
export function birthDatePassword(isoDate: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDate);
  if (match === null) return null;
  const [, year, month, day] = match;
  if (!isRealDate(Number(day), Number(month), Number(year))) return null;
  return `${month}${day}${year}`;
}

export type BirthDateInput =
  | { kind: "date"; value: string; day: number; month: number; year: number }
  | { kind: "day-first"; value: string; day: number; month: number; year: number }
  | { kind: "invalid" };

/**
 * Read what the readee typed as a month-first date: "03141990",
 * "03/14/1990", "3-14-1990" and "3 14 1990" all become "03141990". When the
 * month can't be right but swapping works ("14/03/1990"), report it as
 * day-first (value still MMDDYYYY) so the page can explain the format.
 */
export function parseBirthDateInput(input: string): BirthDateInput {
  const trimmed = input.trim();
  const parts = /^\d{8}$/.test(trimmed)
    ? [trimmed.slice(0, 2), trimmed.slice(2, 4), trimmed.slice(4)]
    : trimmed.split(/[\s/.\-]+/);
  if (parts.length !== 3 || !parts.every((p) => /^\d+$/.test(p)) || parts[2].length !== 4) {
    return { kind: "invalid" };
  }
  const [a, b, year] = parts.map(Number);
  if (isRealDate(b, a, year)) return { kind: "date", value: mmddyyyy(b, a, year), day: b, month: a, year };
  if (isRealDate(a, b, year)) return { kind: "day-first", value: mmddyyyy(a, b, year), day: a, month: b, year };
  return { kind: "invalid" };
}

/**
 * The passwords to try, in order, for what the readee typed:
 * 1. the date as MMDDYYYY (links created from now on),
 * 2. the same date as dd/mm/yyyy (links created before the switch),
 * 3. the text as typed (the very first links, with a free-form password).
 */
export function passwordCandidates(input: string): string[] {
  const parsed = parseBirthDateInput(input);
  const out: string[] = [];
  if (parsed.kind !== "invalid") {
    out.push(parsed.value);
    out.push(`${pad(parsed.day)}/${pad(parsed.month)}/${parsed.year}`);
  }
  out.push(input);
  return [...new Set(out)];
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function mmddyyyy(day: number, month: number, year: number): string {
  return `${pad(month)}${pad(day)}${year}`;
}

function isRealDate(day: number, month: number, year: number): boolean {
  if (month < 1 || month > 12 || day < 1 || year < 1000) return false;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return day <= daysInMonth;
}

/** The chart as the readee sees it: their name, birth data and placements. */
export function toReadeeChart(chart: Chart): Partial<Chart> {
  return {
    id: chart.id,
    person: {
      id: chart.person.id,
      firstName: chart.person.firstName,
      lastName: chart.person.lastName,
    },
    birth: chart.birth,
    planets: chart.planets,
    houses: chart.houses,
    angles: chart.angles,
    aspects: chart.aspects,
    points: chart.points,
  };
}

/** A reading as the readee sees it: the text, without engine metadata. */
export function toReadeeReading(reading: Reading): Pick<Reading, "slug" | "title" | "sections"> {
  return { slug: reading.slug, title: reading.title, sections: reading.sections };
}
