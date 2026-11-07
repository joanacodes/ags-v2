/**
 * Cron expressions in Paris time, which is how the owner writes every schedule in Settings
 * ("0 6 * * 0" = Sunday at 06:00). Five fields: minute hour day-of-month month day-of-week, with
 * lists, ranges and steps. The tick asks `dueBetween` every quarter of an hour.
 */
import { wallTime, type WallTime } from "../time";

interface Field {
  readonly values: ReadonlySet<number>;
  readonly any: boolean;
}

export interface Cron {
  readonly source: string;
  readonly minute: Field;
  readonly hour: Field;
  readonly dom: Field;
  readonly month: Field;
  readonly dow: Field;
}

const LIMITS: readonly [number, number][] = [
  [0, 59],
  [0, 23],
  [1, 31],
  [1, 12],
  [0, 7],
];

function parseField(text: string, [lo, hi]: [number, number], name: string): Field {
  const values = new Set<number>();
  if (text === "*") {
    for (let v = lo; v <= hi; v += 1) values.add(v);
    return { values, any: true };
  }
  for (const part of text.split(",")) {
    const m = /^(\*|\d+)(?:-(\d+))?(?:\/(\d+))?$/.exec(part);
    if (!m) throw new Error(`cron ${name}: cannot read "${part}"`);
    const start = m[1] === "*" ? lo : Number(m[1]);
    const end = m[2] !== undefined ? Number(m[2]) : m[1] === "*" || m[3] !== undefined ? hi : start;
    const step = m[3] !== undefined ? Number(m[3]) : 1;
    if (start < lo || end > hi || start > end || step < 1) throw new Error(`cron ${name}: "${part}" is out of range ${lo}–${hi}`);
    for (let v = start; v <= end; v += step) values.add(v);
  }
  return { values, any: false };
}

export function parseCron(source: string): Cron {
  const fields = source.trim().split(/\s+/);
  if (fields.length !== 5) throw new Error(`a schedule has five fields (minute hour day month weekday), not ${fields.length}`);
  const [mi, ho, dm, mo, dw] = fields as [string, string, string, string, string];
  const dow = parseField(dw, LIMITS[4]!, "weekday");
  if (dow.values.has(7)) {
    const fixed = new Set(dow.values);
    fixed.delete(7);
    fixed.add(0);
    return { source, minute: parseField(mi, LIMITS[0]!, "minute"), hour: parseField(ho, LIMITS[1]!, "hour"), dom: parseField(dm, LIMITS[2]!, "day"), month: parseField(mo, LIMITS[3]!, "month"), dow: { values: fixed, any: dow.any } };
  }
  return {
    source,
    minute: parseField(mi, LIMITS[0]!, "minute"),
    hour: parseField(ho, LIMITS[1]!, "hour"),
    dom: parseField(dm, LIMITS[2]!, "day"),
    month: parseField(mo, LIMITS[3]!, "month"),
    dow,
  };
}

export function isValidCron(source: string): boolean {
  try {
    parseCron(source);
    return true;
  } catch {
    return false;
  }
}

export function matches(cron: Cron, w: WallTime): boolean {
  if (!cron.minute.values.has(w.minute) || !cron.hour.values.has(w.hour) || !cron.month.values.has(w.month)) return false;
  // As in cron: when both day fields are restricted, either may match.
  const domOk = cron.dom.values.has(w.day);
  const dowOk = cron.dow.values.has(w.weekday);
  if (!cron.dom.any && !cron.dow.any) return domOk || dowOk;
  return domOk && dowOk;
}

/** The scheduled moments after `from` and up to `to` (inclusive), in order. */
export function dueBetween(cron: Cron, from: Date, to: Date, max = 10): Date[] {
  const out: Date[] = [];
  const start = Math.floor(from.getTime() / 60000) * 60000 + 60000;
  for (let t = start; t <= to.getTime() && out.length < max; t += 60000) {
    const d = new Date(t);
    if (matches(cron, wallTime(d))) out.push(d);
  }
  return out;
}

/** The next scheduled moment after `after`, looking up to five weeks ahead. */
export function nextRun(cron: Cron, after: Date): Date | null {
  const start = Math.floor(after.getTime() / 60000) * 60000 + 60000;
  const end = start + 35 * 86400000;
  for (let t = start; t <= end; t += 60000) {
    const d = new Date(t);
    if (matches(cron, wallTime(d))) return d;
  }
  return null;
}

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** "Sunday at 06:00", "every day at 08:00 and 18:00", or the expression itself when it's unusual. */
export function describeCron(source: string): string {
  let cron: Cron;
  try {
    cron = parseCron(source);
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
  if (cron.minute.any || cron.hour.any || !cron.month.any || cron.minute.values.size * cron.hour.values.size > 6) {
    if (cron.hour.any && cron.minute.values.size >= 1 && cron.dom.any && cron.dow.any) {
      const step = [...cron.minute.values];
      return step.length > 1 ? `every ${60 / step.length} minutes` : `every hour at minute ${step[0]}`;
    }
    return `"${source}" (Paris time)`;
  }
  const times: string[] = [];
  for (const h of [...cron.hour.values].sort((a, b) => a - b)) {
    for (const m of [...cron.minute.values].sort((a, b) => a - b)) times.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
  }
  const at = times.length > 1 ? `${times.slice(0, -1).join(", ")} and ${times[times.length - 1]}` : times[0];
  let days: string;
  if (cron.dow.any && cron.dom.any) days = "every day";
  else if (!cron.dow.any && cron.dom.any) {
    const list = [...cron.dow.values].sort((a, b) => a - b);
    days = list.length === 5 && list.join() === "1,2,3,4,5" ? "weekdays" : list.map((d) => DAY_NAMES[d]).join(", ");
  } else if (cron.dow.any && !cron.dom.any) days = `on day ${[...cron.dom.values].sort((a, b) => a - b).join(", ")} of the month`;
  else days = `"${source}"`;
  return `${days} at ${at}`;
}
