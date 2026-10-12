/**
 * AI interpretation layer (server-side only).
 *
 * The model receives ONLY the composed sentences and normalized chart
 * facts, and is instructed to ground every statement in that material.
 * The AI writes; the grammar and knowledge base decide what is true.
 *
 * Requires ANTHROPIC_API_KEY in the server environment (.env.local).
 */
import type { InterpretationPipelineResult } from "./pipeline";
import {
  anthropicHeaders,
  modelRequestFields,
  readMessagesResponse,
  type AiModelId,
} from "./ai-models";

export type AiInterpretationOutcome =
  | { readonly status: "ok"; readonly text: string; readonly model: string }
  | { readonly status: "no_api_key" }
  | { readonly status: "refused"; readonly message: string }
  | { readonly status: "provider_error"; readonly message: string };

export interface AiCallOptions {
  readonly model: AiModelId;
  /** The (possibly user-edited) system prompt. */
  readonly systemPrompt: string;
  /** True once the user agreed to a fallback model after a refusal. */
  readonly allowFallback: boolean;
}

function buildPrompt(pipeline: InterpretationPipelineResult, personName: string): string {
  const lines: string[] = [];
  lines.push(`Chart subject: ${personName}`);
  lines.push("");
  lines.push("Composed grammar sentences (the ONLY authorized source material):");
  for (const group of pipeline.groups) {
    lines.push(`\n## ${group.title}`);
    for (const item of group.items) {
      lines.push(`- ${item.sentence}`);
    }
  }
  return lines.join("\n");
}


/** Call the Anthropic API with the pipeline output as sole source material. */
export async function generateAiInterpretation(
  pipeline: InterpretationPipelineResult,
  personName: string,
  options: AiCallOptions,
): Promise<AiInterpretationOutcome> {
  const { model, systemPrompt, allowFallback } = options;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (apiKey === undefined || apiKey.length === 0) {
    return { status: "no_api_key" };
  }
  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: anthropicHeaders(apiKey, allowFallback),
      body: JSON.stringify({
        ...modelRequestFields(model, allowFallback),
        system: systemPrompt,
        messages: [{ role: "user", content: buildPrompt(pipeline, personName) }],
      }),
    });
    if (!response.ok) {
      const body = await response.text();
      return {
        status: "provider_error",
        message: `Anthropic API ${response.status}: ${body.slice(0, 300)}`,
      };
    }
    const result = readMessagesResponse(await response.json(), model);
    if (!result.ok) {
      return { status: result.refused ? "refused" : "provider_error", message: result.message };
    }
    if (result.text.length === 0) {
      return { status: "provider_error", message: "Empty model response." };
    }
    return { status: "ok", text: result.text, model: result.model };
  } catch (error) {
    return {
      status: "provider_error",
      message: error instanceof Error ? error.message : String(error),
    };
  }
}
