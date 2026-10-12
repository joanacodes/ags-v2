/**
 * The Claude models a chart can be written with.
 *
 * The user picks one per chart in the Create Birth Chart wizard; it is stored
 * in `chart.configuration.aiModel` and every AI call for that chart uses it.
 * Charts created before the choice existed fall back to the default.
 *
 * Pure data + helpers: safe to import from client components.
 */

export const AI_MODELS = [
  {
    id: "claude-sonnet-5-5",
    label: "Claude Sonnet 5.5",
    note: "Fast and capable. Recommended for most charts.",
  },
  {
    id: "claude-opus-5-5",
    label: "Claude Opus 5.5",
    note: "Deeper, more nuanced writing. Slower, about twice the cost of Sonnet.",
  },
  {
    id: "claude-fable-5-1",
    label: "Claude Fable 5.1",
    note: "Anthropic's most capable model. Slowest and most expensive.",
  },
] as const;

export type AiModelId = (typeof AI_MODELS)[number]["id"];

export const AI_MODEL_IDS = AI_MODELS.map((m) => m.id) as unknown as readonly [AiModelId, ...AiModelId[]];

export const DEFAULT_AI_MODEL: AiModelId = "claude-sonnet-5-5";

export function isAiModelId(value: unknown): value is AiModelId {
  return typeof value === "string" && AI_MODELS.some((m) => m.id === value);
}

/** The chart's chosen model, or the default when none (or an unknown one) is stored. */
export function resolveAiModel(value: unknown): AiModelId {
  return isAiModelId(value) ? value : DEFAULT_AI_MODEL;
}

export function aiModelLabel(id: string): string {
  return AI_MODELS.find((m) => m.id === id)?.label ?? id;
}

/**
 * Header the browser sends to say the user agreed to a fallback model after
 * the chosen one declined (see `lib/ai-fetch.ts`).
 */
export const ALLOW_FALLBACK_HEADER = "x-ags-allow-fallback";

export function allowFallbackFrom(request: Request): boolean {
  return request.headers.get(ALLOW_FALLBACK_HEADER) === "1";
}

/** Headers for a Messages API call (plus the fallback beta when allowed). */
export function anthropicHeaders(apiKey: string, allowFallback = false): Record<string, string> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "x-api-key": apiKey,
    "anthropic-version": "2023-06-01",
  };
  if (allowFallback) headers["anthropic-beta"] = "server-side-fallback-2026-07-01";
  return headers;
}

/**
 * Model-specific request fields shared by every AI call.
 * - `effort: "medium"`: these models always think before answering; medium
 *   keeps latency inside the route timeouts (Opus 5.5 already defaults to it).
 * - `max_tokens` leaves room for thinking on top of the written output.
 * - `fallbacks: "default"` only once the user has agreed: if the chosen
 *   model declines again, the API re-runs the request on Anthropic's
 *   recommended substitute model.
 */
export function modelRequestFields(
  model: AiModelId,
  allowFallback = false,
): {
  model: AiModelId;
  max_tokens: number;
  output_config: { effort: "medium" };
  fallbacks?: "default";
} {
  return {
    model,
    max_tokens: 16000,
    output_config: { effort: "medium" },
    ...(allowFallback ? { fallbacks: "default" as const } : {}),
  };
}

export const REFUSAL_MESSAGE =
  "The selected AI model declined to write this text. Its safety filter sometimes flags harmless astrology content by mistake.";

interface MessagesResponse {
  model?: string;
  stop_reason?: string;
  content?: ReadonlyArray<{ type: string; text?: string }>;
}

export type MessagesReadResult =
  | { ok: true; text: string; model: string }
  | { ok: false; refused: boolean; message: string };

/**
 * Pull the text and the model that actually answered (which differs from
 * the requested one when a fallback ran). A refusal is reported separately
 * so the UI can ask the user before trying a fallback model.
 */
export function readMessagesResponse(data: MessagesResponse, requested: AiModelId): MessagesReadResult {
  if (data.stop_reason === "refusal") {
    return { ok: false, refused: true, message: REFUSAL_MESSAGE };
  }
  if (data.stop_reason === "max_tokens") {
    return { ok: false, refused: false, message: "The model ran out of output space before finishing. Try again." };
  }
  const text = (data.content ?? [])
    .map((block) => (block.type === "text" && typeof block.text === "string" ? block.text : ""))
    .filter((t) => t.length > 0)
    .join("\n");
  return { ok: true, text, model: typeof data.model === "string" ? data.model : requested };
}
