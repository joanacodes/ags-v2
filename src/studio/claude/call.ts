/**
 * One structured model call, the way every agent makes it: the kit and the rules in the cached system
 * block, the work in the user message, the answer forced into the agent's JSON schema, checked again by
 * zod and by the agent's own rules, and one retry that names what failed. The caller gets the value or
 * an error that says why, plus the tokens and the dollars, which go on the run's row.
 */
import type { z } from "zod/v4";
import { addUsage, costOf, NO_USAGE, type Usage } from "../models";
import type { Effort } from "../types";
import { describeIssues, toApiSchema } from "./schema";
import { ModelOverloadedError, type ModelTransport, type SystemBlock } from "./transport";

export interface StructuredCall<T> {
  readonly transport: ModelTransport;
  readonly model: string;
  readonly effort: Effort;
  readonly maxTokens: number;
  readonly fallbacks: boolean;
  readonly system: readonly SystemBlock[];
  readonly user: string;
  readonly schema: z.ZodType<T>;
  /** Rules zod can't express (shares, similarity, lengths per network): each problem is one line. */
  readonly check?: (value: T) => string[];
  /** Attempts in all, the first included. */
  readonly attempts?: number;
  /** When the model service is overloaded, try once on this model instead (the writers' Haiku). */
  readonly overloadModel?: string;
}

export interface StructuredResult<T> {
  readonly value: T;
  readonly usage: Usage;
  readonly costUsd: number;
  readonly model: string;
  readonly attempts: number;
  readonly fellBack: boolean;
  /** Problems the last attempt still had when the agent accepts a partial answer (never for the schema). */
  readonly remaining: string[];
}

export class StructuredCallError extends Error {
  constructor(
    message: string,
    readonly usage: Usage,
    readonly costUsd: number,
    readonly lastText: string,
  ) {
    super(message);
  }
}

function retryMessage(original: string, previous: string, problems: string[]): string {
  return [
    original,
    "",
    "Your previous answer is below. It did not pass these checks:",
    ...problems.map((p) => `- ${p}`),
    "",
    "Return the whole answer again, corrected, in the same JSON shape. Change only what the checks require.",
    "<previous_answer>",
    previous,
    "</previous_answer>",
  ].join("\n");
}

export async function callStructured<T>(call: StructuredCall<T>): Promise<StructuredResult<T>> {
  const attempts = Math.max(1, call.attempts ?? 2);
  const schema = toApiSchema(call.schema);
  let usage: Usage = NO_USAGE;
  let cost = 0;
  let user = call.user;
  let model = call.model;
  let lastText = "";
  let problems: string[] = [];
  let fellBack = false;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    let response;
    try {
      response = await call.transport.send({
        model,
        maxTokens: call.maxTokens,
        effort: call.effort,
        system: call.system,
        user,
        schema,
        fallbacks: call.fallbacks && model === call.model,
      });
    } catch (err) {
      if (err instanceof ModelOverloadedError && call.overloadModel && model !== call.overloadModel) {
        model = call.overloadModel;
        attempt -= 1;
        continue;
      }
      throw new StructuredCallError(err instanceof Error ? err.message : String(err), usage, cost, lastText);
    }
    usage = addUsage(usage, response.usage);
    cost += costOf(response.model || model, response.usage);
    fellBack = fellBack || response.fellBack;
    lastText = response.text;

    if (response.stopReason === "refusal") {
      throw new StructuredCallError("the model declined to write this (refusal)", usage, cost, lastText);
    }
    if (response.stopReason === "max_tokens") {
      problems = ["the answer was cut off: it ran out of output space. Write less, or fewer items."];
    } else {
      let json: unknown;
      try {
        json = JSON.parse(response.text);
      } catch {
        json = undefined;
        problems = ["the answer is not valid JSON"];
      }
      if (json !== undefined) {
        const parsed = call.schema.safeParse(json);
        if (!parsed.success) {
          problems = describeIssues(parsed.error);
        } else {
          problems = call.check ? call.check(parsed.data) : [];
          if (problems.length === 0) {
            return { value: parsed.data, usage, costUsd: cost, model: response.model || model, attempts: attempt, fellBack, remaining: [] };
          }
          if (attempt === attempts) {
            // The schema holds; the agent decides what to do with rule problems left after the retry.
            return { value: parsed.data, usage, costUsd: cost, model: response.model || model, attempts: attempt, fellBack, remaining: problems };
          }
        }
      }
    }
    user = retryMessage(call.user, response.text, problems);
  }
  throw new StructuredCallError(`the answer failed its checks twice: ${problems.slice(0, 5).join("; ")}`, usage, cost, lastText);
}
