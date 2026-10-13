/**
 * Sentence composer: grammar matches + resolved knowledge -> deterministic
 * composed sentences.
 *
 * Every sentence is assembled ONLY from knowledge-record text (ADR-0002).
 * Missing knowledge produces diagnostics, never invented meaning (ADR-0006).
 * Identical inputs produce identical output (ADR-0003).
 */
import type { GrammarMatch, JsonObject, JsonValue } from "../grammar/types";
import type { KnowledgeRegistry } from "../knowledge/registry";
import type { KnowledgeRecord } from "../knowledge/types";

/** One composed, knowledge-grounded sentence with provenance. */
export interface ComposedSentence {
  readonly matchId: string;
  readonly structure: string;
  /** Short label, e.g. "Venus in Libra". */
  readonly label: string;
  /** The composed sentence (knowledge text only). */
  readonly sentence: string;
  /** Knowledge record keys the sentence was built from. */
  readonly knowledgeUsed: readonly string[];
  /** Source fact IDs inherited from the grammar match. */
  readonly sourceFactIds: readonly string[];
}

/** Sentences grouped by structure, in deterministic order. */
export interface ComposedGroup {
  readonly structure: string;
  readonly title: string;
  readonly items: readonly ComposedSentence[];
}

export type CompositionDiagnosticCode =
  | "KNOWLEDGE_UNRESOLVED"
  | "KNOWLEDGE_FIELD_MISSING"
  | "UNSUPPORTED_STRUCTURE";

export interface CompositionDiagnostic {
  readonly matchId: string;
  readonly code: CompositionDiagnosticCode;
  readonly message: string;
}

export interface CompositionResult {
  readonly groups: readonly ComposedGroup[];
  readonly diagnostics: readonly CompositionDiagnostic[];
}

const GROUP_TITLES: Readonly<Record<string, string>> = {
  planet_in_sign: "Planets in Signs",
  planet_in_house: "Planets in Houses",
  point_in_sign: "Points in Signs",
  point_in_house: "Points in Houses",
  planet_retrograde: "Retrograde Motion",
  planet_aspect_planet: "Aspects",
  angle_in_sign: "Angles",
  house_cusp_in_sign: "House Cusps",
};

const GROUP_ORDER: readonly string[] = [
  "planet_in_sign",
  "planet_in_house",
  "point_in_sign",
  "point_in_house",
  "planet_retrograde",
  "angle_in_sign",
  "house_cusp_in_sign",
  "planet_aspect_planet",
];

/* ---------------- knowledge field readers (defensive) ---------------- */

function moduleOf(record: KnowledgeRecord, name: string): JsonObject | undefined {
  const m = record.modules[name];
  return typeof m === "object" && m !== null && !Array.isArray(m)
    ? (m as JsonObject)
    : undefined;
}

function stringField(obj: JsonObject | undefined, key: string): string | undefined {
  const v = obj?.[key];
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

function stringList(obj: JsonObject | undefined, key: string, max: number): string[] {
  const v: JsonValue | undefined = obj?.[key];
  if (!Array.isArray(v)) return [];
  return v
    .filter((item): item is string => typeof item === "string" && item.length > 0)
    .slice(0, max)
    .map((item) => item.replace(/_/g, " "));
}

function joinList(items: readonly string[]): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0];
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

function tidy(text: string): string {
  const trimmed = text.trim().replace(/\.$/, "");
  return trimmed.charAt(0).toLowerCase() + trimmed.slice(1);
}

/** A record's functional description, across the pack's schema variants. */
export function describeFunction(record: KnowledgeRecord): string | undefined {
  const identity = moduleOf(record, "identity");
  const canonical = stringField(identity, "canonicalFunction");
  if (canonical !== undefined) return tidy(canonical);
  const flatDefinition = stringField(identity, "definition");
  if (flatDefinition !== undefined) return tidy(flatDefinition);
  const coreFunction = identity?.coreFunction;
  if (typeof coreFunction === "object" && coreFunction !== null && !Array.isArray(coreFunction)) {
    const nested = stringField(coreFunction as JsonObject, "definition");
    if (nested !== undefined) return tidy(nested);
  }
  const domains = stringList(identity, "coreDomains", 3);
  if (domains.length > 0) return `carries the domains of ${joinList(domains)}`;
  return undefined;
}

/** Sign/house records -> their core domains phrase. */
export function describeDomains(record: KnowledgeRecord, max: number): string | undefined {
  const identity = moduleOf(record, "identity");
  const domains = stringList(identity, "coreDomains", max);
  return domains.length > 0 ? joinList(domains) : undefined;
}

/* ---------------------------- composition ---------------------------- */

interface Resolved {
  readonly keys: readonly string[];
  readonly records: readonly KnowledgeRecord[];
  readonly missing: readonly string[];
}

function resolveRefs(match: GrammarMatch, registry: KnowledgeRegistry): Resolved {
  const refs = match.metadata?.knowledgeRefs;
  const keys = Array.isArray(refs)
    ? refs.filter((r): r is string => typeof r === "string")
    : [];
  const records: KnowledgeRecord[] = [];
  const missing: string[] = [];
  for (const key of keys) {
    const resolution = registry.resolve(key);
    if (resolution.status === "resolved") records.push(resolution.record);
    else missing.push(key);
  }
  return { keys, records, missing };
}

function valueStr(match: GrammarMatch, key: string): string {
  const v = match.values[key];
  return typeof v === "string" ? v : String(v ?? "");
}

function composeOne(
  match: GrammarMatch,
  registry: KnowledgeRegistry,
  diagnostics: CompositionDiagnostic[],
): ComposedSentence | undefined {
  const { records, missing } = resolveRefs(match, registry);
  for (const key of missing) {
    diagnostics.push({
      matchId: match.id,
      code: "KNOWLEDGE_UNRESOLVED",
      message: `No knowledge record for "${key}".`,
    });
  }
  const used = records.map((r) => r.id);
  const byId = new Map(records.map((r) => [r.id, r]));
  const record = (prefix: string): KnowledgeRecord | undefined => {
    for (const [id, r] of byId) if (id.startsWith(prefix)) return r;
    return undefined;
  };

  switch (match.structure) {
    case "point_in_sign":
    case "planet_in_sign": {
      const point = valueStr(match, "point");
      const sign = valueStr(match, "sign");
      const planetRec = record("planets/") ?? record("points/") ?? record("angles/");
      const signRec = record("signs/");
      const fn = planetRec ? describeFunction(planetRec) : undefined;
      const mod = signRec ? describeDomains(signRec, 3) : undefined;
      if (fn === undefined && mod === undefined) return incomplete();
      let text = `${point} in ${sign}`;
      if (fn !== undefined) text += ` — ${point} ${fn}`;
      if (mod !== undefined) text += `; ${sign} shapes this expression toward ${mod}`;
      return sentence(`${point} in ${sign}`, `${text}.`);
    }
    case "point_in_house":
    case "planet_in_house": {
      const point = valueStr(match, "point");
      const house = valueStr(match, "house");
      const planetRec = record("planets/") ?? record("points/") ?? record("angles/");
      const houseRec = record("houses/");
      const fn = planetRec ? describeFunction(planetRec) : undefined;
      const ctx = houseRec ? describeDomains(houseRec, 3) : undefined;
      if (fn === undefined && ctx === undefined) return incomplete();
      let text = `${point} in House ${house}`;
      if (fn !== undefined) text += ` — ${point} ${fn}`;
      if (ctx !== undefined) text += `; here it operates in the context of ${ctx}`;
      return sentence(`${point} in House ${house}`, `${text}.`);
    }
    case "planet_aspect_planet": {
      const from = valueStr(match, "from");
      const to = valueStr(match, "to");
      const type = valueStr(match, "type");
      const orb = valueStr(match, "orb");
      const aspectRec = record("aspects/");
      const fn = aspectRec ? describeFunction(aspectRec) : undefined;
      if (fn === undefined) return incomplete();
      const orbPart = orb.length > 0 && orb !== "null" ? ` (orb ${orb})` : "";
      return sentence(
        `${from} ${type} ${to}`,
        `${from} ${type} ${to}${orbPart} — the ${type} ${fn}.`,
      );
    }
    case "angle_in_sign": {
      const point = valueStr(match, "point");
      const sign = valueStr(match, "sign");
      const angleRec = record("angles/");
      const signRec = record("signs/");
      const fn = angleRec ? describeFunction(angleRec) : undefined;
      const mod = signRec ? describeDomains(signRec, 3) : undefined;
      if (fn === undefined && mod === undefined) return incomplete();
      let text = `${point} in ${sign}`;
      if (fn !== undefined) text += ` — its function is to ${fn}`;
      if (mod !== undefined) text += `; ${sign} orients it toward ${mod}`;
      return sentence(`${point} in ${sign}`, `${text}.`);
    }
    case "house_cusp_in_sign": {
      const house = valueStr(match, "house");
      const sign = valueStr(match, "sign");
      const houseRec = record("houses/");
      const signRec = record("signs/");
      const ctx = houseRec ? describeDomains(houseRec, 3) : undefined;
      const mod = signRec ? describeDomains(signRec, 3) : undefined;
      if (ctx === undefined && mod === undefined) return incomplete();
      let text = `House ${house} cusp in ${sign}`;
      if (ctx !== undefined) text += ` — matters of ${ctx}`;
      if (mod !== undefined) text += `${ctx !== undefined ? " are" : " — its matters are"} approached through ${mod}`;
      return sentence(`House ${house} cusp in ${sign}`, `${text}.`);
    }
    case "planet_retrograde": {
      const point = valueStr(match, "point");
      const bodyRec = record("planets/") ?? record("points/");
      const conditionRec = record("conditions/");
      const fn = bodyRec ? describeFunction(bodyRec) : undefined;
      const cond = conditionRec ? describeFunction(conditionRec) : undefined;
      if (cond === undefined) return incomplete();
      let text = `${point} retrograde`;
      if (fn !== undefined) text += ` — ${point} ${fn}`;
      text += `; in retrograde motion it ${cond}`;
      return sentence(`${point} retrograde`, `${text}.`);
    }
    default:
      diagnostics.push({
        matchId: match.id,
        code: "UNSUPPORTED_STRUCTURE",
        message: `No composition template for structure "${match.structure}".`,
      });
      return undefined;
  }

  function sentence(label: string, text: string): ComposedSentence {
    return {
      matchId: match.id,
      structure: match.structure,
      label,
      sentence: text,
      knowledgeUsed: used,
      sourceFactIds: match.sourceFactIds,
    };
  }
  function incomplete(): undefined {
    diagnostics.push({
      matchId: match.id,
      code: "KNOWLEDGE_FIELD_MISSING",
      message: `Knowledge for match "${match.id}" lacks composable fields.`,
    });
    return undefined;
  }
}

/** Compose all matches into deterministic, grouped sentences. */
export function composeSentences(
  matches: readonly GrammarMatch[],
  registry: KnowledgeRegistry,
): CompositionResult {
  const diagnostics: CompositionDiagnostic[] = [];
  const byStructure = new Map<string, ComposedSentence[]>();

  for (const match of matches) {
    const composed = composeOne(match, registry, diagnostics);
    if (composed === undefined) continue;
    const list = byStructure.get(composed.structure) ?? [];
    list.push(composed);
    byStructure.set(composed.structure, list);
  }

  const groups: ComposedGroup[] = [];
  const structures = [
    ...GROUP_ORDER.filter((s) => byStructure.has(s)),
    ...[...byStructure.keys()].filter((s) => !GROUP_ORDER.includes(s)).sort(),
  ];
  for (const structure of structures) {
    const items = byStructure.get(structure);
    if (items === undefined) continue;
    groups.push({
      structure,
      title: GROUP_TITLES[structure] ?? structure,
      items,
    });
  }
  return { groups, diagnostics };
}
