/**
 * Public grammar API (TASK-0001, ADR-0008: exports are deliberate).
 */
export type {
  JsonPrimitive,
  JsonValue,
  JsonObject,
  GrammarFact,
  NormalizedGrammarInput,
  GrammarExecutionContext,
  GrammarMatch,
  GrammarDiagnostic,
  GrammarDiagnosticCode,
  GrammarExecutionResult,
} from "./types";
export type { GrammarRule } from "./rule";
export {
  GrammarError,
  DuplicateRuleRegistrationError,
  DuplicateMatchIdError,
  InvalidRuleOutputError,
  GrammarRuleUnsupportedInputError,
  type GrammarErrorCode,
} from "./errors";
export { GrammarRegistry, compareStrings } from "./registry";
export { GrammarExecutor } from "./executor";
