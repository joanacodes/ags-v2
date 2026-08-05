/**
 * Loads the generated core vocabulary pack (src/data/knowledge-pack.json,
 * built by scripts/build-knowledge-pack.mjs) into a KnowledgeRegistry.
 */
import corePackJson from "../data/knowledge-pack.json";
import { KnowledgeRegistry } from "./registry";
import type { KnowledgePack } from "./types";

/** The core pack as shipped with the repository. */
export function coreKnowledgePack(): KnowledgePack {
  return corePackJson as unknown as KnowledgePack;
}

/** A registry pre-loaded with the core vocabulary pack (validated). */
export function createCoreKnowledgeRegistry(): KnowledgeRegistry {
  const registry = new KnowledgeRegistry();
  registry.loadPack(coreKnowledgePack());
  return registry;
}
