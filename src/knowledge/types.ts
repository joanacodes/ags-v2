/**
 * Knowledge layer contracts (ADR-0002: knowledge is external data;
 * ADR-0009: runtime validation at data boundaries).
 */
import type { JsonObject } from "../grammar/types";

/** One meaning-bearing record for a vocabulary entity. */
export interface KnowledgeRecord {
  /** Stable key, e.g. "planets/venus". */
  readonly id: string;
  /** Vocabulary category, e.g. "planets". */
  readonly category: string;
  /** Entity name within the category, e.g. "venus". */
  readonly entity: string;
  /** Prompt-facing modules keyed by module name (identity, semantics, …). */
  readonly modules: Readonly<Record<string, JsonObject>>;
}

/** A versioned, locale-aware collection of knowledge records. */
export interface KnowledgePack {
  readonly $schemaVersion: string;
  readonly packId: string;
  readonly version: string;
  readonly locale: string;
  readonly records: Readonly<Record<string, KnowledgeRecord>>;
}

/** Explicit resolution outcome (never invented meaning, ADR-0006). */
export type KnowledgeResolution =
  | { readonly status: "resolved"; readonly key: string; readonly record: KnowledgeRecord }
  | { readonly status: "unresolved"; readonly key: string; readonly reason: string };

/** Typed error codes for fatal knowledge-layer failures. */
export type KnowledgeErrorCode = "INVALID_PACK" | "DUPLICATE_RECORD";

/** Base class for fatal knowledge errors. */
export abstract class KnowledgeError extends Error {
  abstract readonly code: KnowledgeErrorCode;
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

/** The pack failed structural validation. */
export class InvalidPackError extends KnowledgeError {
  readonly code = "INVALID_PACK" as const;
  constructor(reason: string) {
    super(`Invalid knowledge pack: ${reason}`);
  }
}

/** Two records with the same key were registered. */
export class DuplicateRecordError extends KnowledgeError {
  readonly code = "DUPLICATE_RECORD" as const;
  constructor(readonly key: string) {
    super(`Duplicate knowledge record key "${key}".`);
  }
}
