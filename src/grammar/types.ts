/**
 * Core grammar contracts (TASK-0001).
 *
 * Grammar describes astrological STRUCTURE, never meaning (ADR-0001).
 * All values are JSON-compatible and readonly; no UI chart types are
 * imported here (tradition-neutral core, ADR-0004).
 */

/** JSON-compatible primitive. */
export type JsonPrimitive = string | number | boolean | null;

/** Any JSON-compatible value. */
export type JsonValue =
  | JsonPrimitive
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue };

/** JSON-compatible object record. */
export type JsonObject = { readonly [key: string]: JsonValue };

/**
 * A single normalized astrological fact.
 * Facts are generic structure/value records; their production (from an
 * ephemeris, a chart model, or fixtures) is outside the grammar layer.
 */
export interface GrammarFact {
  /** Stable identifier, unique within one input. */
  readonly id: string;
  /** Structure discriminator, e.g. "planet_position" (no meaning implied). */
  readonly structure: string;
  /** Normalized JSON-compatible values for this fact. */
  readonly values: JsonObject;
  /** Optional JSON-compatible metadata; never affects ordering. */
  readonly metadata?: JsonObject;
}

/** Normalized input handed to the grammar executor. */
export interface NormalizedGrammarInput {
  /** Stable input identifier. */
  readonly id: string;
  /** Normalized facts. */
  readonly facts: readonly GrammarFact[];
  /** Optional JSON-compatible metadata; never affects ordering. */
  readonly metadata?: JsonObject;
}

/** Execution context passed to every rule evaluation. */
export interface GrammarExecutionContext {
  /** Optional JSON-compatible configuration or environment metadata. */
  readonly metadata?: JsonObject;
}

/**
 * Deterministic output of a grammar rule.
 * Contains structure and normalized values only — no interpretive prose.
 */
export interface GrammarMatch {
  /** Stable match identifier, unique within one execution. */
  readonly id: string;
  /** Identifier of the rule that produced this match. */
  readonly ruleId: string;
  /** Structure discriminator of the detected pattern. */
  readonly structure: string;
  /** Normalized JSON-compatible values describing the detected structure. */
  readonly values: JsonObject;
  /** IDs of the input facts this match was derived from. */
  readonly sourceFactIds: readonly string[];
  /** Optional JSON-compatible metadata; never affects ordering. */
  readonly metadata?: JsonObject;
}

/** Diagnostic codes for recoverable, rule-local failures (ADR-0006). */
export type GrammarDiagnosticCode = "RULE_FAILED" | "RULE_UNSUPPORTED_INPUT";

/** Typed, recoverable diagnostic emitted during execution. */
export interface GrammarDiagnostic {
  /** Identifier of the rule the diagnostic originates from. */
  readonly ruleId: string;
  /** Typed diagnostic code. */
  readonly code: GrammarDiagnosticCode;
  /** Human-readable message (not astrological meaning). */
  readonly message: string;
  /** Optional JSON-compatible metadata. */
  readonly metadata?: JsonObject;
}

/** Result of one deterministic grammar execution. */
export interface GrammarExecutionResult {
  /** Canonically ordered matches (structure, then rule ID, then match ID). */
  readonly matches: readonly GrammarMatch[];
  /** Recoverable diagnostics collected during execution. */
  readonly diagnostics: readonly GrammarDiagnostic[];
}
