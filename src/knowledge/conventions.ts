/**
 * Reference conventions shipped in the knowledge pack (`conventions/*`),
 * validated at the data boundary (ADR-0009) and handed to the grammar rules
 * that need them. They are tables, not meanings: which planet rules which
 * sign in a named tradition, and under which daily motion a body counts as
 * stationary. Keeping them in the pack keeps the core tradition-neutral
 * (ADR-0004) and keeps astrology tables out of TypeScript (ADR-0002).
 *
 * An absent record resolves to null so a rule can report a diagnostic; a
 * malformed record is a fatal pack error, never a silent default.
 */
import type { JsonObject } from "../grammar/types";
import type { KnowledgeRegistry } from "./registry";
import { InvalidPackError } from "./types";

export const RULERSHIPS_KEY = "conventions/rulerships";
export const STATIONS_KEY = "conventions/stations";

export interface RulershipTable {
  readonly tradition: string;
  /** Sign name -> ruling planet name. */
  readonly rulers: Readonly<Record<string, string>>;
}

export interface StationThresholds {
  /** Body name -> degrees per day under which it is stationary. */
  readonly thresholds: Readonly<Record<string, number>>;
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** The `reference` module of a conventions record, or null when absent. */
function referenceOf(registry: KnowledgeRegistry, key: string): JsonObject | null {
  const resolution = registry.resolve(key);
  if (resolution.status !== "resolved") return null;
  const reference = resolution.record.modules.reference;
  if (!isObject(reference)) throw new InvalidPackError(`${key}: missing "reference" module`);
  return reference;
}

/**
 * The rulership table for a tradition (the record's default when none is
 * named). Null when the pack carries no rulerships at all.
 */
export function loadRulershipTable(
  registry: KnowledgeRegistry,
  tradition?: string,
): RulershipTable | null {
  const reference = referenceOf(registry, RULERSHIPS_KEY);
  if (reference === null) return null;
  const tables = reference.tables;
  if (!isObject(tables)) throw new InvalidPackError(`${RULERSHIPS_KEY}: "tables" must be an object`);
  const name = tradition ?? (typeof reference.default === "string" ? reference.default : "modern");
  const table = tables[name];
  if (!isObject(table)) throw new InvalidPackError(`${RULERSHIPS_KEY}: no table named "${name}"`);
  const rulers: Record<string, string> = {};
  for (const [sign, ruler] of Object.entries(table)) {
    if (typeof ruler !== "string" || ruler.length === 0) {
      throw new InvalidPackError(`${RULERSHIPS_KEY}: ruler of "${sign}" in "${name}" must be a planet name`);
    }
    rulers[sign] = ruler;
  }
  return { tradition: name, rulers };
}

/** Station thresholds, or null when the pack carries none. */
export function loadStationThresholds(registry: KnowledgeRegistry): StationThresholds | null {
  const reference = referenceOf(registry, STATIONS_KEY);
  if (reference === null) return null;
  const raw = reference.thresholds;
  if (!isObject(raw)) throw new InvalidPackError(`${STATIONS_KEY}: "thresholds" must be an object`);
  const thresholds: Record<string, number> = {};
  for (const [body, value] of Object.entries(raw)) {
    if (typeof value !== "number" || !(value > 0)) {
      throw new InvalidPackError(`${STATIONS_KEY}: threshold of "${body}" must be a positive number`);
    }
    thresholds[body] = value;
  }
  return { thresholds };
}
