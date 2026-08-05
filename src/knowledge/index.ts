/** Public knowledge API (ADR-0008: exports are deliberate). */
export type { KnowledgeRecord, KnowledgePack, KnowledgeResolution, KnowledgeErrorCode } from "./types";
export { KnowledgeError, InvalidPackError, DuplicateRecordError } from "./types";
export { KnowledgeRegistry } from "./registry";
export { coreKnowledgePack, createCoreKnowledgeRegistry } from "./pack-loader";
