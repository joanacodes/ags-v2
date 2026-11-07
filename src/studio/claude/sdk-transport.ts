/**
 * The Anthropic SDK behind the Studio's ModelTransport. Server and workers only: it reads the key.
 *
 * Every call is streamed and collected with finalMessage(), so a long strategist answer never hits an
 * HTTP timeout. The JSON schema goes in output_config.format; effort in output_config.effort; thinking
 * is left to the model (always on for these models). Direct Opus and Sonnet calls may ask for
 * Anthropic's refusal fallback; batches can't (the API refuses it there).
 */
import Anthropic from "@anthropic-ai/sdk";
import type { Usage } from "../models";
import {
  ModelOverloadedError,
  ModelRequestError,
  type BatchItem,
  type BatchResult,
  type BatchStatus,
  type ModelRequest,
  type ModelResponse,
  type ModelTransport,
} from "./transport";

const FALLBACK_BETA = "server-side-fallback-2026-07-01";

interface UsageLike {
  input_tokens?: number | null;
  output_tokens?: number | null;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
  cache_creation?: { ephemeral_1h_input_tokens?: number | null } | null;
  iterations?: ReadonlyArray<{ type?: string }> | null;
}

interface MessageLike {
  model?: string;
  stop_reason?: string | null;
  content: ReadonlyArray<{ type: string; text?: string }>;
  usage: UsageLike;
}

function usageOf(u: UsageLike): Usage {
  return {
    inputTokens: u.input_tokens ?? 0,
    outputTokens: u.output_tokens ?? 0,
    cacheReadTokens: u.cache_read_input_tokens ?? 0,
    cacheWriteTokens: u.cache_creation_input_tokens ?? 0,
    cacheWrite1h: (u.cache_creation?.ephemeral_1h_input_tokens ?? 0) > 0,
  };
}

function responseOf(message: MessageLike, requested: string): ModelResponse {
  const text = message.content
    .filter((b) => b.type === "text" && typeof b.text === "string")
    .map((b) => b.text ?? "")
    .join("");
  const fellBack =
    message.content.some((b) => b.type === "fallback") ||
    (message.usage.iterations ?? []).some((i) => i.type === "fallback_message");
  return {
    text,
    stopReason: message.stop_reason ?? null,
    model: message.model ?? requested,
    usage: usageOf(message.usage),
    fellBack,
  };
}

function systemOf(request: ModelRequest): Anthropic.TextBlockParam[] {
  return request.system.map((block) => ({
    type: "text" as const,
    text: block.text,
    ...(block.cache ? { cache_control: { type: "ephemeral" as const, ...(block.cache === "1h" ? { ttl: "1h" as const } : {}) } } : {}),
  }));
}

function paramsOf(request: ModelRequest): Anthropic.MessageCreateParamsNonStreaming {
  return {
    model: request.model,
    max_tokens: request.maxTokens,
    system: systemOf(request),
    messages: [{ role: "user", content: request.user }],
    output_config: {
      effort: request.effort,
      format: { type: "json_schema", schema: request.schema as Record<string, unknown> },
    },
  };
}

function translate(err: unknown): Error {
  if (err instanceof Anthropic.APIError) {
    const status = err.status ?? 0;
    if (status === 529 || /overloaded/i.test(err.message)) return new ModelOverloadedError(err.message);
    if (status >= 400 && status < 500 && status !== 429) return new ModelRequestError(`${status}: ${err.message}`);
    return new Error(`model API error ${status}: ${err.message}`);
  }
  return err instanceof Error ? err : new Error(String(err));
}

export class SdkTransport implements ModelTransport {
  private readonly client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey, maxRetries: 4 });
  }

  async send(request: ModelRequest): Promise<ModelResponse> {
    try {
      if (request.fallbacks) {
        const stream = this.client.beta.messages.stream({
          ...(paramsOf(request) as unknown as Anthropic.Beta.Messages.MessageCreateParamsNonStreaming),
          betas: [FALLBACK_BETA],
          fallbacks: "default",
        });
        const message = await stream.finalMessage();
        return responseOf(message as unknown as MessageLike, request.model);
      }
      const message = await this.client.messages.stream(paramsOf(request)).finalMessage();
      return responseOf(message as unknown as MessageLike, request.model);
    } catch (err) {
      throw translate(err);
    }
  }

  async submitBatch(items: readonly BatchItem[]): Promise<string> {
    try {
      const batch = await this.client.messages.batches.create({
        requests: items.map((item) => ({ custom_id: item.customId, params: paramsOf(item.request) })),
      });
      return batch.id;
    } catch (err) {
      throw translate(err);
    }
  }

  async batchStatus(id: string): Promise<BatchStatus> {
    const batch = await this.client.messages.batches.retrieve(id);
    return {
      id: batch.id,
      ended: batch.processing_status === "ended",
      counts: {
        processing: batch.request_counts.processing,
        succeeded: batch.request_counts.succeeded,
        errored: batch.request_counts.errored + batch.request_counts.expired + batch.request_counts.canceled,
      },
    };
  }

  async batchResults(id: string): Promise<BatchResult[]> {
    const out: BatchResult[] = [];
    for await (const item of await this.client.messages.batches.results(id)) {
      if (item.result.type === "succeeded") {
        const message = item.result.message as unknown as MessageLike;
        out.push({ customId: item.custom_id, ok: true, response: responseOf(message, message.model ?? "") });
      } else {
        const reason = item.result.type === "errored" ? JSON.stringify(item.result.error) : item.result.type;
        out.push({ customId: item.custom_id, ok: false, error: reason });
      }
    }
    return out;
  }

  async cancelBatch(id: string): Promise<void> {
    await this.client.messages.batches.cancel(id);
  }

  async listModels(): Promise<{ id: string; label: string; context: number | null; maxOutput: number | null }[]> {
    const out: { id: string; label: string; context: number | null; maxOutput: number | null }[] = [];
    for await (const model of this.client.models.list({ limit: 100 })) {
      out.push({ id: model.id, label: model.display_name, context: model.max_input_tokens ?? null, maxOutput: model.max_tokens ?? null });
    }
    return out;
  }
}

/** The transport from the environment, or null with the reason when there is no key. */
export function transportFromEnv(): { transport: SdkTransport | null; missing: string | null } {
  const key = (process.env.ANTHROPIC_API_KEY ?? "").trim();
  if (key === "") return { transport: null, missing: "ANTHROPIC_API_KEY is not set" };
  return { transport: new SdkTransport(key), missing: null };
}
