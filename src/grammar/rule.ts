/**
 * GrammarRule contract (TASK-0001).
 */
import type {
  GrammarExecutionContext,
  GrammarMatch,
  NormalizedGrammarInput,
} from "./types";

/**
 * A generic detector of one astrological structure (ADR-0001: rules carry
 * no interpretive meaning). Evaluation may be synchronous or asynchronous;
 * the executor normalizes both through `Promise.resolve` so a single
 * public contract covers both implementations.
 */
export interface GrammarRule {
  /** Stable rule identifier, unique within a registry. */
  readonly id: string;
  /** Structure discriminator this rule detects. */
  readonly structure: string;
  /** Produce zero or more matches for the given normalized input. */
  evaluate(
    input: NormalizedGrammarInput,
    context: GrammarExecutionContext,
  ): readonly GrammarMatch[] | Promise<readonly GrammarMatch[]>;
}
