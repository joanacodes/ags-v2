/**
 * GrammarExecutor (TASK-0001): deterministic execution of registered rules.
 *
 * Determinism guarantees (ADR-0003):
 * - rules execute in ascending rule-ID order (registry order)
 * - source fact IDs are canonicalized ascending
 * - matches are ordered by structure, then rule ID, then match ID
 * - metadata never affects ordering
 * - no wall-clock or random values
 */
import {
  DuplicateMatchIdError,
  GrammarRuleUnsupportedInputError,
  InvalidRuleOutputError,
} from "./errors";
import { compareStrings, type GrammarRegistry } from "./registry";
import type { GrammarRule } from "./rule";
import type {
  GrammarDiagnostic,
  GrammarExecutionContext,
  GrammarExecutionResult,
  GrammarMatch,
  NormalizedGrammarInput,
} from "./types";

/** Runtime shape validation of one rule's output (contract corruption is fatal). */
function validateMatch(rule: GrammarRule, match: unknown): GrammarMatch {
  if (typeof match !== "object" || match === null) {
    throw new InvalidRuleOutputError(rule.id, "match is not an object");
  }
  const m = match as Record<string, unknown>;
  if (typeof m.id !== "string" || m.id.length === 0) {
    throw new InvalidRuleOutputError(rule.id, "match id must be a non-empty string");
  }
  if (m.ruleId !== rule.id) {
    throw new InvalidRuleOutputError(
      rule.id,
      `match "${m.id}" carries ruleId "${String(m.ruleId)}"`,
    );
  }
  if (typeof m.structure !== "string" || m.structure.length === 0) {
    throw new InvalidRuleOutputError(
      rule.id,
      `match "${m.id}" structure must be a non-empty string`,
    );
  }
  if (typeof m.values !== "object" || m.values === null || Array.isArray(m.values)) {
    throw new InvalidRuleOutputError(rule.id, `match "${m.id}" values must be an object`);
  }
  if (
    !Array.isArray(m.sourceFactIds) ||
    m.sourceFactIds.some((f) => typeof f !== "string" || f.length === 0)
  ) {
    throw new InvalidRuleOutputError(
      rule.id,
      `match "${m.id}" sourceFactIds must be an array of non-empty strings`,
    );
  }
  return match as GrammarMatch;
}

/** Canonicalize one match: source fact IDs sorted ascending. */
function canonicalizeMatch(match: GrammarMatch): GrammarMatch {
  return {
    ...match,
    sourceFactIds: [...match.sourceFactIds].sort(compareStrings),
  };
}

/** Canonical match ordering: structure, then rule ID, then match ID. */
function compareMatches(a: GrammarMatch, b: GrammarMatch): number {
  return (
    compareStrings(a.structure, b.structure) ||
    compareStrings(a.ruleId, b.ruleId) ||
    compareStrings(a.id, b.id)
  );
}

/** Executes every registered rule against one normalized input. */
export class GrammarExecutor {
  /**
   * Runs all rules in deterministic registry order. Recoverable rule
   * failures become diagnostics; contract corruption throws typed
   * fatal errors. Repeated execution with identical inputs yields
   * deeply equal results.
   */
  async execute(
    input: NormalizedGrammarInput,
    context: GrammarExecutionContext,
    registry: GrammarRegistry,
  ): Promise<GrammarExecutionResult> {
    const matches: GrammarMatch[] = [];
    const diagnostics: GrammarDiagnostic[] = [];
    const seenMatchIds = new Map<string, string>(); // match id -> rule id

    for (const rule of registry.list()) {
      let ruleOutput: readonly GrammarMatch[];
      try {
        ruleOutput = await Promise.resolve(rule.evaluate(input, context));
      } catch (error) {
        if (
          error instanceof DuplicateMatchIdError ||
          error instanceof InvalidRuleOutputError
        ) {
          throw error; // structural — never downgraded to a diagnostic
        }
        if (error instanceof GrammarRuleUnsupportedInputError) {
          diagnostics.push({
            ruleId: rule.id,
            code: "RULE_UNSUPPORTED_INPUT",
            message: error.message,
          });
        } else {
          diagnostics.push({
            ruleId: rule.id,
            code: "RULE_FAILED",
            message: error instanceof Error ? error.message : String(error),
          });
        }
        continue;
      }

      if (!Array.isArray(ruleOutput)) {
        throw new InvalidRuleOutputError(rule.id, "evaluate() did not return an array");
      }

      for (const raw of ruleOutput) {
        const match = canonicalizeMatch(validateMatch(rule, raw));
        const firstRuleId = seenMatchIds.get(match.id);
        if (firstRuleId !== undefined) {
          throw new DuplicateMatchIdError(match.id, firstRuleId, rule.id);
        }
        seenMatchIds.set(match.id, rule.id);
        matches.push(match);
      }
    }

    matches.sort(compareMatches);
    return { matches, diagnostics };
  }
}
