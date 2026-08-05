/**
 * GrammarRegistry (TASK-0001): deterministic rule registration and lookup.
 */
import { DuplicateRuleRegistrationError } from "./errors";
import type { GrammarRule } from "./rule";

/** Locale-independent, code-unit string comparison (deterministic). */
export function compareStrings(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

/**
 * Holds grammar rules keyed by their stable IDs.
 * Listing order is ascending rule ID, independent of insertion order.
 */
export class GrammarRegistry {
  private readonly rules = new Map<string, GrammarRule>();

  /** Register one rule; duplicate IDs are rejected explicitly. */
  register(rule: GrammarRule): void {
    if (this.rules.has(rule.id)) {
      throw new DuplicateRuleRegistrationError(rule.id);
    }
    this.rules.set(rule.id, rule);
  }

  /** Retrieve a rule by ID, or undefined when absent. */
  get(ruleId: string): GrammarRule | undefined {
    return this.rules.get(ruleId);
  }

  /** All rules sorted deterministically by ascending rule ID. */
  list(): readonly GrammarRule[] {
    return [...this.rules.values()].sort((a, b) => compareStrings(a.id, b.id));
  }

  /** Number of registered rules. */
  size(): number {
    return this.rules.size;
  }

  /** Remove every registered rule. */
  clear(): void {
    this.rules.clear();
  }
}
