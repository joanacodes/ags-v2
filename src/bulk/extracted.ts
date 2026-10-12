/**
 * Birth data pulled out of photos or spreadsheets for the bulk import.
 * The AI fills the schema below; `normalizePerson` cleans what comes back so
 * the review page only ever sees well-formed values (or empty ones to fill).
 *
 * Pure: unit-tested.
 */

export interface ExtractedPerson {
  firstName: string;
  lastName: string;
  /** YYYY-MM-DD, or "" when unreadable. */
  birthDate: string;
  /** HH:MM (24 h), or "" when unknown. */
  birthTime: string;
  birthPlace: string;
  /** Anything the astrologer should double-check. */
  notes: string;
  /** File names the data was read from (one person can span several pictures). */
  sources: string[];
}

/** JSON schema for the AI's structured output. */
export const EXTRACTION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["people"],
  properties: {
    people: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["firstName", "lastName", "birthDate", "birthTime", "birthPlace", "notes", "sources"],
        properties: {
          firstName: { type: "string" },
          lastName: { type: "string" },
          birthDate: { type: "string", description: "YYYY-MM-DD, or empty if unreadable" },
          birthTime: { type: "string", description: "HH:MM in 24-hour time, or empty if unknown" },
          birthPlace: { type: "string", description: "As precise as given: address, town, region, country" },
          notes: { type: "string", description: "Doubts to check, or empty" },
          sources: {
            type: "array",
            items: { type: "string" },
            description: "File names this person's data was read from",
          },
        },
      },
    },
  },
} as const;

function isRealDate(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12 || day < 1 || year < 1000 || year > 2100) return false;
  return day <= new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** "1990-3-4", "1990-03-04T…" → "1990-03-04"; anything else → "". */
export function normalizeDate(value: string): string {
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(value.trim());
  if (m === null) return "";
  const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (!isRealDate(year, month, day)) return "";
  return `${m[1]}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** "8:05", "08h05", "20:30:00", "8.05 pm" → "HH:MM"; anything else → "". */
export function normalizeTime(value: string): string {
  const m = /^(\d{1,2})\s*[:hH.]\s*(\d{2})(?::\d{2})?\s*(am|pm|AM|PM)?$/.exec(value.trim());
  if (m === null) return "";
  let hours = Number(m[1]);
  const minutes = Number(m[2]);
  const suffix = m[3]?.toLowerCase();
  if (suffix === "pm" && hours < 12) hours += 12;
  if (suffix === "am" && hours === 12) hours = 0;
  if (hours > 23 || minutes > 59) return "";
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function text(value: unknown, max = 200): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export function normalizePerson(raw: unknown): ExtractedPerson {
  const r = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  const birthDateRaw = text(r.birthDate, 40);
  const birthTimeRaw = text(r.birthTime, 20);
  const birthDate = normalizeDate(birthDateRaw);
  const birthTime = normalizeTime(birthTimeRaw);
  const notes = [text(r.notes, 500)];
  if (birthDateRaw !== "" && birthDate === "") notes.push(`Date not understood: "${birthDateRaw}".`);
  if (birthTimeRaw !== "" && birthTime === "") notes.push(`Time not understood: "${birthTimeRaw}".`);
  return {
    firstName: text(r.firstName, 80),
    lastName: text(r.lastName, 80),
    birthDate,
    birthTime,
    birthPlace: text(r.birthPlace, 200),
    notes: notes.filter((n) => n.length > 0).join(" "),
    sources: Array.isArray(r.sources)
      ? [...new Set(r.sources.map((x) => text(x, 120)).filter((x) => x !== ""))].slice(0, 20)
      : [],
  };
}

/** Parse the AI's JSON answer into clean people (drops fully empty rows). */
export function parseExtraction(json: string): ExtractedPerson[] {
  const cleaned = json.replace(/```json|```/g, "").trim();
  const data = JSON.parse(cleaned) as { people?: unknown };
  if (!Array.isArray(data.people)) throw new Error("The AI answer had no list of people.");
  return data.people
    .map(normalizePerson)
    .filter((p) => p.firstName !== "" || p.lastName !== "" || p.birthDate !== "" || p.birthPlace !== "");
}
