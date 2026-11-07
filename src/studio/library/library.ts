/**
 * The astrology library the Studio writes from: AGS's own definition library (knowledge/vocabulary, built into
 * src/data/knowledge-pack.json), the same definitions the reading engine hands the AI. Every Studio agent that
 * writes about astrology gets the entries for what it is writing about, and the gate stops a piece that gives an
 * entity a quality the library says it does not carry. Meanings come from here, never from a model's memory:
 * otherwise a post and a reading could say two different things about the same placement.
 *
 * The glossary's grammar holds throughout: a planet is a function (what), a sign the manner of it (how), a house
 * its context (where), an aspect a relationship between two functions, an angle an orientation.
 */
import { stringify } from "yaml";
import { coreKnowledgePack } from "../../knowledge/pack-loader";
import type { Language } from "../types";

// The modules the reading engine gives the AI (knowledge/manifest.json, promptModules); metadata, changelog, tests
// and reasoning are bookkeeping and never sent.
const PROMPT_MODULES = ["identity", "semantics", "grammar", "language", "modifier_types", "development", "expression", "query_rules"] as const;

export interface LibraryEntry {
  /** The record's id in the pack, e.g. "signs/scorpio". */
  readonly id: string;
  readonly name: string;
  readonly kind: "planet" | "sign" | "house" | "angle" | "aspect" | "point";
  readonly definition: string | null;
  /** Each domain with its meaning when the library gives one. */
  readonly domains: readonly string[];
  /** What the library says the entity does not carry: never written as its quality. */
  readonly notInherent: readonly string[];
  readonly boundaries: readonly string[];
  /** The entry in full, as the library holds it: its prompt modules, unabridged. */
  readonly modules: Readonly<Record<string, unknown>>;
}

// how each kind sits in the glossary's grammar, said once at the head of its entries
const ROLE: Readonly<Record<LibraryEntry["kind"], string>> = {
  planet: "a function: what acts",
  sign: "a modifier: how a function acts; it never acts alone",
  house: "a context: where a function acts; it never acts itself",
  angle: "an orientation of the chart",
  aspect: "a relationship between two functions",
  point: "a point with its own function",
};

// The names a piece may use for each entity, per language. Capitalised where the word is also an ordinary one
// (Cancer, Leo, Lion, Balance), so "a lion" or "the balance" in French is not read as the sign.
type Names = { readonly en: readonly string[]; readonly fr: readonly string[] };
const ORDINALS_EN = ["first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth", "ninth", "tenth", "eleventh", "twelfth"];
const ORDINALS_FR = ["première", "deuxième", "troisième", "quatrième", "cinquième", "sixième", "septième", "huitième", "neuvième", "dixième", "onzième", "douzième"];
const SUFFIX_EN = (n: number) => (n === 1 ? "st" : n === 2 ? "nd" : n === 3 ? "rd" : "th");

const NAMES: Readonly<Record<string, Names>> = {
  "planets/sun": { en: ["Sun"], fr: ["Soleil"] },
  "planets/moon": { en: ["Moon"], fr: ["Lune"] },
  "planets/mercury": { en: ["Mercury"], fr: ["Mercure"] },
  "planets/venus": { en: ["Venus"], fr: ["Vénus"] },
  "planets/mars": { en: ["Mars"], fr: ["Mars"] },
  "planets/jupiter": { en: ["Jupiter"], fr: ["Jupiter"] },
  "planets/saturn": { en: ["Saturn"], fr: ["Saturne"] },
  "planets/uranus": { en: ["Uranus"], fr: ["Uranus"] },
  "planets/neptune": { en: ["Neptune"], fr: ["Neptune"] },
  "planets/pluto": { en: ["Pluto"], fr: ["Pluton"] },
  "signs/aries": { en: ["Aries"], fr: ["Bélier"] },
  "signs/taurus": { en: ["Taurus"], fr: ["Taureau"] },
  "signs/gemini": { en: ["Gemini"], fr: ["Gémeaux"] },
  "signs/cancer": { en: ["Cancer"], fr: ["Cancer"] },
  "signs/leo": { en: ["Leo"], fr: ["Lion"] },
  "signs/virgo": { en: ["Virgo"], fr: ["Vierge"] },
  "signs/libra": { en: ["Libra"], fr: ["Balance"] },
  "signs/scorpio": { en: ["Scorpio"], fr: ["Scorpion"] },
  "signs/sagittarius": { en: ["Sagittarius"], fr: ["Sagittaire"] },
  "signs/capricorn": { en: ["Capricorn"], fr: ["Capricorne"] },
  "signs/aquarius": { en: ["Aquarius"], fr: ["Verseau"] },
  "signs/pisces": { en: ["Pisces"], fr: ["Poissons"] },
  "angles/ascendant": { en: ["Ascendant", "rising sign", "Rising"], fr: ["Ascendant", "signe ascendant"] },
  "angles/midheaven": { en: ["Midheaven", "MC"], fr: ["Milieu du Ciel", "MC"] },
  "angles/descendant": { en: ["Descendant"], fr: ["Descendant"] },
  "angles/imum_coeli": { en: ["Imum Coeli", "IC"], fr: ["Fond du Ciel", "FC"] },
  "aspects/conjunction": { en: ["conjunction", "conjunct"], fr: ["conjonction"] },
  "aspects/opposition": { en: ["opposition"], fr: ["opposition"] },
  "aspects/trine": { en: ["trine"], fr: ["trigone"] },
  "aspects/square": { en: ["square"], fr: ["carré"] },
  "aspects/sextile": { en: ["sextile"], fr: ["sextile"] },
  "aspects/quincunx": { en: ["quincunx", "inconjunct"], fr: ["quinconce"] },
  "aspects/semisextile": { en: ["semi-sextile", "semisextile"], fr: ["semi-sextile"] },
  "aspects/semisquare": { en: ["semi-square", "semisquare"], fr: ["semi-carré"] },
  "aspects/sesquiquadrate": { en: ["sesquiquadrate"], fr: ["sesqui-carré"] },
  "aspects/quintile": { en: ["quintile"], fr: ["quintile"] },
  "aspects/biquintile": { en: ["biquintile"], fr: ["biquintile"] },
  "points/chiron": { en: ["Chiron"], fr: ["Chiron"] },
  "points/lilith": { en: ["Lilith"], fr: ["Lilith"] },
  "points/north_node": { en: ["North Node"], fr: ["Nœud Nord"] },
  "points/south_node": { en: ["South Node"], fr: ["Nœud Sud"] },
  ...Object.fromEntries(
    Array.from({ length: 12 }, (_, i) => {
      const n = i + 1;
      return [`houses/house_${n}`, {
        en: [`${n}${SUFFIX_EN(n)} house`, `${ORDINALS_EN[i]} house`, `house ${n}`],
        fr: [`maison ${n}`, `${n}e maison`, `${n}ème maison`, `${ORDINALS_FR[i]} maison`],
      }];
    }),
  ),
};

const KIND: Readonly<Record<string, LibraryEntry["kind"]>> = { planets: "planet", signs: "sign", houses: "house", angles: "angle", aspects: "aspect", points: "point" };

const words = (id: string) => id.replace(/_/g, " ");
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

// The pack's modules differ by kind (an angle's domains are objects, a point's exclusions stand where a sign's
// boundaries are), so each field is read wherever its kind keeps it.
function entryOf(id: string, modules: Record<string, unknown>): LibraryEntry {
  const identity = isRecord(modules.identity) ? modules.identity : {};
  const semantics = isRecord(modules.semantics) ? modules.semantics : {};
  const core = isRecord(identity.coreFunction) ? identity.coreFunction : {};
  const definition = [semantics.definition, identity.canonicalFunction, identity.definition, core.definition].find((d): d is string => typeof d === "string") ?? null;
  const domains: string[] = [];
  if (isRecord(semantics.domains)) {
    for (const [k, v] of Object.entries(semantics.domains)) domains.push(typeof v === "string" ? `${words(k)}: ${v}` : words(k));
  } else if (Array.isArray(semantics.coreDomains)) {
    for (const d of semantics.coreDomains) if (isRecord(d) && typeof d.name === "string") domains.push(typeof d.definition === "string" ? `${d.name}: ${d.definition}` : d.name);
  }
  if (!domains.length) domains.push(...strings(identity.coreDomains).map(words));
  const notInherent = [...strings(identity.notInherent), ...strings(identity.doesNotInherentlySupply)].map(words);
  const boundaries = [...strings(semantics.boundaries), ...strings(semantics.exclusions), ...strings(identity.angleBoundaries)];
  const names = NAMES[id];
  const name = names?.en[0] ?? words(id.split("/")[1] ?? id);
  const full: Record<string, unknown> = {};
  for (const m of PROMPT_MODULES) if (modules[m] !== undefined) full[m] = modules[m];
  return { id, name: name.charAt(0).toUpperCase() + name.slice(1), kind: KIND[id.split("/")[0] ?? ""] ?? "point", definition, domains, notInherent, boundaries, modules: full };
}

let cache: ReadonlyMap<string, LibraryEntry> | null = null;

/** Every entity the Studio can name, read once from the pack. */
export function libraryEntries(): ReadonlyMap<string, LibraryEntry> {
  if (cache) return cache;
  const records = (coreKnowledgePack() as unknown as { records: Record<string, { modules?: unknown }> }).records;
  const out = new Map<string, LibraryEntry>();
  for (const id of Object.keys(NAMES)) {
    const rec = records[id];
    if (rec && isRecord(rec.modules)) out.set(id, entryOf(id, rec.modules));
  }
  cache = out;
  return out;
}

const escape = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
// a name as a whole word, plural or possessive allowed ("Scorpios", "Saturn's"); capitalised names match only
// capitalised, so ordinary words don't pass for entities
function nameRe(name: string): RegExp {
  const caseless = name === name.toLowerCase();
  return new RegExp(`(?<![\\p{L}\\p{N}])${escape(name)}(?:s|['’]s)?(?![\\p{L}\\p{N}])`, caseless ? "iu" : "u");
}

/** The entities a text names, in the language it is written in. */
export function entitiesIn(text: string, language: Language): LibraryEntry[] {
  const lib = libraryEntries();
  const found: LibraryEntry[] = [];
  for (const [id, names] of Object.entries(NAMES)) {
    const entry = lib.get(id);
    if (entry && names[language].some((n) => nameRe(n).test(text))) found.push(entry);
  }
  return found;
}

/** One entry as the agents read it. */
export function describeEntry(e: LibraryEntry): string {
  return [
    `${e.name} (${e.kind}, ${ROLE[e.kind]})`,
    e.definition ? `  definition: ${e.definition}` : "",
    e.domains.length ? `  domains: ${e.domains.join("; ")}` : "",
    e.notInherent.length ? `  not inherent, never write these as ${e.name}'s: ${e.notInherent.join(", ")}` : "",
    e.boundaries.length ? `  boundaries: ${e.boundaries.join(" ")}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * One entry in full: the library's own text, every module the readings use (identity, semantics, grammar, the
 * approved language, development, expression…), unabridged and uncopied, read from the pack each time. Headed by
 * what it is and what it must never be written as, so a writer meets the limits first.
 */
export function fullEntry(e: LibraryEntry): string {
  return [
    `### ${e.name} (${e.kind}, ${ROLE[e.kind]}) — library entry ${e.id}`,
    e.notInherent.length ? `Never write these as ${e.name}'s: ${e.notInherent.join(", ")}.` : "",
    stringify(e.modules, { lineWidth: 0 }).trim(),
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * The library's entries, in full, for whatever a text names, or null when it names nothing astrological. A card
 * may be written in English for a French piece (a "both" card), so names are looked for in every language given.
 */
export function librarySectionFor(text: string, languages: readonly Language[]): string | null {
  const found = new Map<string, LibraryEntry>();
  for (const language of languages) for (const e of entitiesIn(text, language)) found.set(e.id, e);
  return found.size ? [...found.values()].map(fullEntry).join("\n\n") : null;
}

/**
 * The whole core library in short (planets, signs, houses, angles, the aspects, the points): the strategist's
 * overview, every week. In full it is about 350,000 characters, so the full entries go only where they are needed:
 * for what the week's inputs, a card or a comment names.
 */
export function coreLibrarySection(): string {
  return [...libraryEntries().values()].map(describeEntry).join("\n\n");
}

// A not-inherent quality as the words a piece might use for it: "vengefulness" also catches "vengeful", "luck"
// "lucky", "passivity" "passive". Multi-word ones ("lack of boundaries") are matched as phrases.
// The few whose noun and adjective part ways ("secrecy", "secretive") are listed; "dependency" keeps "dependen" so
// that "it depends" is not taken for dependency.
const STEMS: Readonly<Record<string, string>> = { secrecy: "secret" };
function qualityRe(quality: string): RegExp {
  if (quality.includes(" ")) return new RegExp(`\\b${escape(quality)}\\b`, "i");
  const stem = STEMS[quality] ?? quality.replace(/(?<=en|an)cy$/i, "").replace(/(iness|ness|ity|ism|ion|hood|ence|ance|y)$/i, "");
  return new RegExp(`\\b${escape(stem.length >= 4 ? stem : quality)}\\w*`, "i");
}

// A quality is denied when a negation stands just before it ("is not vengeful", "neither are jealousy, manipulation
// or secrecy") or a denial follows it ("vengefulness isn't part of Scorpio"). Only the words next to it count: in
// "Scorpios are vengeful, and they never forget" the "never" belongs to something else.
const NEGATION_BEFORE = /\b(not|never|no|nor|without|isn['’]t|aren['’]t|wasn['’]t|doesn['’]t|don['’]t|can['’]t|won['’]t|neither|rather than)\b/i;
const DENIAL_AFTER = /^[\w’'-]*\s+(isn['’]t|aren['’]t|is not|are not|was not|wasn['’]t|has no|plays no)\b/i;

function denied(sentence: string, at: number, length: number): boolean {
  const before = sentence.slice(0, at).split(/\s+/).slice(-7).join(" ");
  return NEGATION_BEFORE.test(before) || DENIAL_AFTER.test(sentence.slice(at, at + length + 40));
}

/**
 * Sentences of an English text that give an entity it names a quality the library rules out ("Scorpios are
 * vengeful", "the 8th house of death"). A quality the sentence denies ("Scorpio is not vengeful") passes: saying
 * what a sign is not is exactly what the library's boundaries do.
 */
export function notInherentHits(text: string, language: Language): { entity: string; quality: string; sentence: string }[] {
  if (language !== "en") return [];
  const hits: { entity: string; quality: string; sentence: string }[] = [];
  // a cliché quoted to be answered ("“Scorpios are vengeful.” Not quite.") is mentioned, not said: quotations are
  // set aside before the sentences are read
  const said = text.replace(/[“«"][^”»"]*[”»"]/g, " ");
  const sentences = said.split(/(?<=[.!?…])\s+|\n+/).map((s) => s.trim()).filter(Boolean);
  for (const sentence of sentences) {
    for (const e of entitiesIn(sentence, language)) {
      for (const q of e.notInherent) {
        const m = qualityRe(q).exec(sentence);
        if (m && !denied(sentence, m.index, m[0].length)) hits.push({ entity: e.name, quality: q, sentence });
      }
    }
  }
  return hits;
}
