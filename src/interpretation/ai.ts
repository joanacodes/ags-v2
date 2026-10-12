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
  | { readonly status: "provider_error"; readonly message: string };

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

const SYSTEM_PROMPT = [
  "You are the AI interpretation layer of AGS (Astrology Grammar System),",
  "writing for a TOTAL BEGINNER. You receive composed sentences produced",
  "deterministically from a birth chart and a curated knowledge base.",
  "Hard rules:",
  "1. Every claim must trace to the provided sentences. Never introduce",
  "   planets, signs, houses, aspects, or meanings absent from the material;",
  "   never contradict it. Cover every factor at least once — skip none.",
  "2. Teach as you interpret: when you first use a factor, explain in plain",
  "   words how it works (planet = a function of the person, sign = its",
  "   style, house = the life area, aspect = how two functions interact,",
  "   retrograde = the function runs inward-first). One clause is enough.",
  "3. Be concrete: anchor each major point in a precise everyday situation",
  "   the reader can recognize — a meeting, a message, a family dinner.",
  "4. Explain why: connect each interpretation back to its factor",
  "   ('because Venus — how you value and relate — sits in…').",
  "5. Warm, direct second person. No mystical filler, no robotic trait",
  "   lists. Vary sentence length, like a sharp and kind teacher.",
  "6. No medical, legal, or financial advice; no predictions of specific",
  "   events — tendencies, not fate.",
  "7. Write 4 to 6 paragraphs of plain prose. No headings, no lists.",
].join("\n");

/** Call the Anthropic API with the pipeline output as sole source material. */
export async function generateAiInterpretation(
  pipeline: InterpretationPipelineResult,
  personName: string,
  model: AiModelId,
): Promise<AiInterpretationOutcome> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (apiKey === undefined || apiKey.length === 0) {
    return { status: "no_api_key" };
  }
  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: anthropicHeaders(apiKey),
      body: JSON.stringify({
        ...modelRequestFields(model),
        system: SYSTEM_PROMPT,
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
    if (!result.ok) return { status: "provider_error", message: result.message };
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
