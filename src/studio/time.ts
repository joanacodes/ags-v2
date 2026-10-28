/**
 * Paris time, ISO weeks and the arithmetic the schedules need. The Studio's clock is Paris (the
 * owner's), the database's is UTC: every conversion goes through here, and the clock change is
 * handled by asking the platform's time zone data, never by a fixed offset.
 */

export const PARIS = "Europe/Paris";

export interface WallTime {
  readonly year: number;
  readonly month: number;
  readonly day: number;
  readonly hour: number;
  readonly minute: number;
  /** 0 = Sunday … 6 = Saturday, as in cron. */
  readonly weekday: number;
}

const WEEKDAYS: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

const formatters = new Map<string, Intl.DateTimeFormat>();
function formatter(timeZone: string): Intl.DateTimeFormat {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-GB", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      weekday: "short",
      hourCycle: "h23",
    });
    formatters.set(timeZone, f);
  }
  return f;
}

export function wallTime(date: Date, timeZone: string = PARIS): WallTime {
  const parts = Object.fromEntries(formatter(timeZone).formatToParts(date).map((p) => [p.type, p.value]));
  return {
    year: Number(parts["year"]),
    month: Number(parts["month"]),
    day: Number(parts["day"]),
    hour: Number(parts["hour"]),
    minute: Number(parts["minute"]),
    weekday: WEEKDAYS[parts["weekday"] ?? "Sun"] ?? 0,
  };
}

const pad = (n: number) => String(n).padStart(2, "0");

/** "YYYY-MM-DD" of a date in Paris. */
export function parisDate(date: Date): string {
  const w = wallTime(date);
  return `${w.year}-${pad(w.month)}-${pad(w.day)}`;
}

/** "HH:MM" of a date in Paris. */
export function parisTime(date: Date): string {
  const w = wallTime(date);
  return `${pad(w.hour)}:${pad(w.minute)}`;
}

/** The instant at which Paris shows this date and time (the first one, on the autumn's repeated hour). */
export function fromParis(date: string, time: string, timeZone: string = PARIS): Date {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const [hh, mm] = time.split(":").map(Number) as [number, number];
  const target = Date.UTC(y, m - 1, d, hh, mm);
  // Start from the wall time read as UTC, then correct by the zone's offset at the guess; twice is
  // enough to settle across a clock change.
  let guess = target;
  for (let i = 0; i < 3; i += 1) {
    const w = wallTime(new Date(guess), timeZone);
    const shown = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute);
    guess += target - shown;
  }
  return new Date(guess);
}

export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

/** Day of the week of a calendar date, 0 = Sunday. */
export function weekdayOf(date: string): number {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** ISO 8601 week of a calendar date: "2026-W46". */
export function isoWeekOf(date: string): string {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const t = new Date(Date.UTC(y, m - 1, d));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const yearStart = Date.UTC(t.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((t.getTime() - yearStart) / 86400000 + 1) / 7);
  return `${t.getUTCFullYear()}-W${pad(week)}`;
}

/** The week a moment falls in, in Paris. */
export function parisWeek(date: Date): string {
  return isoWeekOf(parisDate(date));
}

/** Monday's date of an ISO week. */
export function mondayOf(week: string): string {
  const m = /^(\d{4})-W(\d{2})$/.exec(week);
  if (!m) throw new Error(`not an ISO week: ${week}`);
  const year = Number(m[1]);
  const n = Number(m[2]);
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const day = jan4.getUTCDay() || 7;
  const monday = new Date(Date.UTC(year, 0, 4 - day + 1 + (n - 1) * 7));
  return `${monday.getUTCFullYear()}-${pad(monday.getUTCMonth() + 1)}-${pad(monday.getUTCDate())}`;
}

/** The seven dates of a week, Monday first. */
export function daysOf(week: string): string[] {
  const monday = mondayOf(week);
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

export function nextWeek(week: string): string {
  return isoWeekOf(addDays(mondayOf(week), 7));
}

export function previousWeek(week: string): string {
  return isoWeekOf(addDays(mondayOf(week), -7));
}

/** Monday 00:00 Paris of the week of `date`, as an instant. */
export function weekStart(date: Date): Date {
  return fromParis(mondayOf(parisWeek(date)), "00:00");
}

/** The 1st of the month 00:00 Paris, as an instant. */
export function monthStart(date: Date): Date {
  const w = wallTime(date);
  return fromParis(`${w.year}-${pad(w.month)}-01`, "00:00");
}

/** "Sunday 9 November, 07:30" in the owner's words (English, as the Studio's screens). */
export function describeParis(date: Date): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: PARIS, weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(date);
}
