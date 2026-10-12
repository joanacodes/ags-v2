/**
 * InterpretationService — sole owner of interpretation data access.
 * This is the first service backed by real API routes instead of mock
 * JSON: the pipeline runs server-side (grammar + knowledge + AI).
 */
import type { InterpretationPipelineResult } from "@/interpretation/pipeline";
import { aiFetch } from "@/lib/ai-fetch";

export interface SavedAiInterpretation {
  text: string;
  model: string;
  generatedAt: string;
}

export type InterpretationWithSaved = InterpretationPipelineResult & {
  savedAi: SavedAiInterpretation | null;
};

export interface AiInterpretationResponse {
  text: string;
  model: string;
}

async function readError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: { message?: string } };
    return body.error?.message ?? `Request failed (${response.status})`;
  } catch {
    return `Request failed (${response.status})`;
  }
}

export const InterpretationService = {
  /** Deterministic composed sentences for a chart. */
  async getInterpretation(chartId: string): Promise<InterpretationWithSaved> {
    const response = await fetch(`/api/charts/${chartId}/interpretation`);
    if (!response.ok) throw new Error(await readError(response));
    return (await response.json()) as InterpretationWithSaved;
  },

  /** AI prose grounded in the composed sentences (server-side key). */
  async generateAiInterpretation(chartId: string): Promise<AiInterpretationResponse> {
    const response = await aiFetch(`/api/charts/${chartId}/interpretation/ai`, {
      method: "POST",
    });
    if (!response.ok) throw new Error(await readError(response));
    return (await response.json()) as AiInterpretationResponse;
  },
};
