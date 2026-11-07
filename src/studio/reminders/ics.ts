/** The reminders as a calendar feed (RFC 5545), for the owner's phone: GET /api/reminders.ics?token=… */
import type { ReminderRow } from "../store/rows";

const stamp = (iso: string) => iso.replace(/[-:]/g, "").replace(/\.\d{3}/, "");
/** Text values escape backslashes, semicolons, commas and newlines; lines fold at 75 octets. */
const text = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
function fold(line: string): string {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;
  const out: string[] = [];
  let current = "";
  for (const ch of line) {
    if (new TextEncoder().encode(current + ch).length > (out.length ? 74 : 75)) {
      out.push(current);
      current = ch;
    } else current += ch;
  }
  out.push(current);
  return out.join("\r\n ");
}

export function remindersIcs(rows: readonly ReminderRow[], baseUrl: string, now: Date): string {
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//The Astro Study//Studio//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", "X-WR-CALNAME:The Studio", "X-WR-TIMEZONE:Europe/Paris"];
  for (const r of rows) {
    if (r.status === "cancelled") continue;
    const start = r.status === "snoozed" && r.snoozed_until ? r.snoozed_until : r.due_at;
    const end = new Date(Date.parse(start) + 15 * 60_000).toISOString();
    const link = r.link ? (r.link.startsWith("http") ? r.link : `${baseUrl}${r.link}`) : null;
    lines.push(
      "BEGIN:VEVENT",
      `UID:${r.id}@studio.astrostudy`,
      `DTSTAMP:${stamp(now.toISOString())}`,
      `DTSTART:${stamp(new Date(start).toISOString())}`,
      `DTEND:${stamp(end)}`,
      fold(`SUMMARY:${text(r.title)}`),
      ...(r.body ? [fold(`DESCRIPTION:${text(r.body + (link ? `\n${link}` : ""))}`)] : link ? [fold(`DESCRIPTION:${text(link)}`)] : []),
      ...(link ? [fold(`URL:${link}`)] : []),
      `STATUS:${r.status === "done" ? "CANCELLED" : "CONFIRMED"}`,
      "BEGIN:VALARM",
      "ACTION:DISPLAY",
      fold(`DESCRIPTION:${text(r.title)}`),
      "TRIGGER:PT0M",
      "END:VALARM",
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return lines.join("\r\n") + "\r\n";
}

/** A calendar the owner pastes (.ics) as rows for the Studio's calendar: each event's date and summary. */
export function parseIcs(source: string): { date: string; event: string; note: string | null }[] {
  const unfolded = source.replace(/\r?\n[ \t]/g, "");
  const out: { date: string; event: string; note: string | null }[] = [];
  for (const block of unfolded.split("BEGIN:VEVENT").slice(1)) {
    const body = block.split("END:VEVENT")[0] ?? "";
    const field = (name: string) => new RegExp(`^${name}(?:;[^:\\r\\n]*)?:(.*)$`, "m").exec(body)?.[1]?.trim() ?? null;
    const start = field("DTSTART");
    const summary = field("SUMMARY");
    if (!start || !summary) continue;
    const m = /^(\d{4})(\d{2})(\d{2})/.exec(start);
    if (!m) continue;
    const unescape = (s: string) => s.replace(/\\n/gi, "\n").replace(/\\([,;\\])/g, "$1");
    const description = field("DESCRIPTION");
    out.push({ date: `${m[1]}-${m[2]}-${m[3]}`, event: unescape(summary).slice(0, 200), note: description ? unescape(description).slice(0, 1000) : null });
  }
  return out;
}
