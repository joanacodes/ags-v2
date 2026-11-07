/**
 * How the Studio talks to a model, kept apart from the SDK so the agents can be tested with a fake
 * transport and no key, and so the one place that knows the API's shape is small.
 */
import type { Effort } from "../types";
import type { Usage } from "../models";
import type { JsonSchema } from "./schema";

export interface SystemBlock {
  readonly text: string;
  /** Mark the end of the stable part: everything up to here is cached for the next calls. */
  readonly cache?: "5m" | "1h";
}

export interface ModelRequest {
  readonly model: string;
  readonly maxTokens: number;
  readonly effort: Effort;
  readonly system: readonly SystemBlock[];
  readonly user: string;
  readonly schema: JsonSchema;
  /** Ask Anthropic to re-run a refused request on its substitute model (direct calls only). */
  readonly fallbacks: boolean;
}

export interface ModelResponse {
  /** The JSON the model wrote, as text. */
  readonly text: string;
  readonly stopReason: string | null;
  /** The model that actually answered (differs from the request's when a fallback ran). */
  readonly model: string;
  readonly usage: Usage;
  readonly fellBack: boolean;
}

export interface BatchItem {
  readonly customId: string;
  readonly request: ModelRequest;
}

export type BatchResult =
  | { readonly customId: string; readonly ok: true; readonly response: ModelResponse }
  | { readonly customId: string; readonly ok: false; readonly error: string };

export interface BatchStatus {
  readonly id: string;
  readonly ended: boolean;
  readonly counts: { readonly processing: number; readonly succeeded: number; readonly errored: number };
}

export interface ModelTransport {
  send(request: ModelRequest): Promise<ModelResponse>;
  submitBatch(items: readonly BatchItem[]): Promise<string>;
  batchStatus(id: string): Promise<BatchStatus>;
  batchResults(id: string): Promise<BatchResult[]>;
  cancelBatch(id: string): Promise<void>;
  listModels(): Promise<{ id: string; label: string; context: number | null; maxOutput: number | null }[]>;
}

/** Raised when the model service is overloaded after the SDK's own retries (HTTP 529). */
export class ModelOverloadedError extends Error {}
/** Raised for a request the API refuses outright (HTTP 4xx other than 429). */
export class ModelRequestError extends Error {}
