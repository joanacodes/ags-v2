/**
 * KnowledgeRegistry: deterministic registration and lookup of knowledge
 * records. Missing keys resolve to explicit "unresolved" outcomes —
 * meaning is never invented (ADR-0006, spec §7).
 */
import { compareStrings } from "../grammar/registry";
import {
  DuplicateRecordError,
  InvalidPackError,
  type KnowledgePack,
  type KnowledgeRecord,
  type KnowledgeResolution,
} from "./types";

function validateRecord(key: string, record: unknown): KnowledgeRecord {
  if (typeof record !== "object" || record === null) {
    throw new InvalidPackError(`record "${key}" is not an object`);
  }
  const r = record as Record<string, unknown>;
  if (r.id !== key) {
    throw new InvalidPackError(`record "${key}" id mismatch ("${String(r.id)}")`);
  }
  if (typeof r.category !== "string" || typeof r.entity !== "string") {
    throw new InvalidPackError(`record "${key}" category/entity must be strings`);
  }
  if (typeof r.modules !== "object" || r.modules === null || Array.isArray(r.modules)) {
    throw new InvalidPackError(`record "${key}" modules must be an object`);
  }
  return record as KnowledgeRecord;
}

export class KnowledgeRegistry {
  private readonly records = new Map<string, KnowledgeRecord>();
  private readonly packIds: string[] = [];

  /** Validate and register every record of a pack; duplicates are fatal. */
  loadPack(pack: KnowledgePack): void {
    if (typeof pack !== "object" || pack === null) {
      throw new InvalidPackError("pack is not an object");
    }
    if (typeof pack.packId !== "string" || pack.packId.length === 0) {
      throw new InvalidPackError("packId must be a non-empty string");
    }
    if (typeof pack.records !== "object" || pack.records === null) {
      throw new InvalidPackError("records must be an object");
    }
    for (const [key, raw] of Object.entries(pack.records)) {
      const record = validateRecord(key, raw);
      if (this.records.has(key)) {
        throw new DuplicateRecordError(key);
      }
      this.records.set(key, record);
    }
    this.packIds.push(pack.packId);
  }

  /** Explicit resolution: resolved record or typed unresolved outcome. */
  resolve(key: string): KnowledgeResolution {
    const record = this.records.get(key);
    if (record === undefined) {
      return { status: "unresolved", key, reason: "no record registered for key" };
    }
    return { status: "resolved", key, record };
  }

  /** All record keys, sorted deterministically. */
  keys(): readonly string[] {
    return [...this.records.keys()].sort(compareStrings);
  }

  /** Number of registered records. */
  size(): number {
    return this.records.size;
  }

  /** Loaded pack IDs in load order. */
  loadedPacks(): readonly string[] {
    return [...this.packIds];
  }

  /** Remove all records and pack registrations. */
  clear(): void {
    this.records.clear();
    this.packIds.length = 0;
  }
}
