/**
 * ReadingService — sole owner of reading data access for the frontend.
 * Now backed by real API routes: demo readings are served for the sample
 * chart, generated readings (grammar + teaching AI) for real charts.
 */
import type { Reading, ReadingProgressSummary, WritingStyle } from "@/types";
import { aiFetch } from "@/lib/ai-fetch";

async function readError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: { message?: string } };
    return body.error?.message ?? `Request failed (${response.status})`;
  } catch {
    return `Request failed (${response.status})`;
  }
}

export const ReadingService = {
  async listReadings(chartId: string): Promise<Reading[]> {
    const response = await fetch(`/api/charts/${chartId}/readings`);
    if (!response.ok) throw new Error(await readError(response));
    return (await response.json()) as Reading[];
  },

  async getReading(chartId: string, slug: string): Promise<Reading> {
    const response = await fetch(`/api/charts/${chartId}/readings/${slug}`);
    if (!response.ok) throw new Error(await readError(response));
    return (await response.json()) as Reading;
  },

  async getProgress(chartId: string): Promise<ReadingProgressSummary> {
    const response = await fetch(`/api/charts/${chartId}/readings?progress=1`);
    if (!response.ok) throw new Error(await readError(response));
    return (await response.json()) as ReadingProgressSummary;
  },

  /** Generate (or regenerate) the full domain reading. */
  async regenerateReading(
    chartId: string,
    slug: string,
    style: WritingStyle,
    language: string = "en",
  ): Promise<Reading> {
    const response = await aiFetch(`/api/charts/${chartId}/readings/${slug}/generate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ style, language }),
    });
    if (!response.ok) throw new Error(await readError(response));
    return (await response.json()) as Reading;
  },
};
