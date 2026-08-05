/**
 * Typed fatal errors for structural grammar failures (TASK-0001, ADR-0006).
 * Recoverable, rule-local failures are expressed as diagnostics instead.
 */

/** Machine-readable error codes for fatal grammar errors. */
export type GrammarErrorCode =
  | "DUPLICATE_RULE_REGISTRATION"
  | "DUPLICATE_MATCH_ID"
  | "INVALID_RULE_OUTPUT";

/** Base class for all fatal grammar errors. */
export abstract class GrammarError extends Error {
  abstract readonly code: GrammarErrorCode;

  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

/** A rule with the same ID was already registered. */
export class DuplicateRuleRegistrationError extends GrammarError {
  readonly code = "DUPLICATE_RULE_REGISTRATION" as const;

  constructor(readonly ruleId: string) {
    super(`A grammar rule with id "${ruleId}" is already registered.`);
  }
}

/** Two match outputs in one execution carry the same match ID. */
export class DuplicateMatchIdError extends GrammarError {
  readonly code = "DUPLICATE_MATCH_ID" as const;

  constructor(
    readonly matchId: string,
    readonly firstRuleId: string,
    readonly secondRuleId: string,
  ) {
    super(
      `Duplicate grammar match id "${matchId}" produced by rules ` +
        `"${firstRuleId}" and "${secondRuleId}".`,
    );
  }
}

/** A rule returned output violating the GrammarMatch contract. */
export class InvalidRuleOutputError extends GrammarError {
  readonly code = "INVALID_RULE_OUTPUT" as const;

  constructor(readonly ruleId: string, reason: string) {
    super(`Grammar rule "${ruleId}" produced invalid output: ${reason}`);
  }
}

/**
 * Rules may throw this to signal that the given input is outside their
 * supported domain. The executor converts it into a recoverable
 * RULE_UNSUPPORTED_INPUT diagnostic instead of failing the execution.
 */
export class GrammarRuleUnsupportedInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GrammarRuleUnsupportedInputError";
  }
}
