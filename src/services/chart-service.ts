/**
 * ChartService — sole owner of chart data access for the frontend.
 *
 * As designed from day one, this layer swapped from mock JSON to real API
 * routes without any component or hook changing: same methods, same types.
 * The server merges persisted user charts (Supabase) with the demo library.
 */
import type { Chart, ChartDraft, ChartLibraryStats } from "@/types";

async function readError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: { message?: string } };
    return body.error?.message ?? `Request failed (${response.status})`;
  } catch {
    return `Request failed (${response.status})`;
  }
}

export const ChartService = {
  async listCharts(): Promise<Chart[]> {
    const response = await fetch("/api/charts");
    if (!response.ok) throw new Error(await readError(response));
    return (await response.json()) as Chart[];
  },

  async getChart(chartId: string): Promise<Chart> {
    const response = await fetch(`/api/charts/${chartId}`);
    if (!response.ok) throw new Error(await readError(response));
    return (await response.json()) as Chart;
  },

  async getLibraryStats(): Promise<ChartLibraryStats> {
    const response = await fetch("/api/charts?stats=1");
    if (!response.ok) throw new Error(await readError(response));
    return (await response.json()) as ChartLibraryStats;
  },

  async toggleFavourite(chartId: string): Promise<Chart> {
    const response = await fetch(`/api/charts/${chartId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "toggle-favourite" }),
    });
    if (!response.ok) throw new Error(await readError(response));
    return (await response.json()) as Chart;
  },

  /** (Re)run the real ephemeris calculation for a pending/failed chart. */
  async calculateChart(chartId: string): Promise<Chart> {
    const response = await fetch(`/api/charts/${chartId}/calculate`, { method: "POST" });
    if (!response.ok) throw new Error(await readError(response));
    return (await response.json()) as Chart;
  },

  async setStatus(chartId: string, status: "active" | "archived"): Promise<Chart> {
    const response = await fetch(`/api/charts/${chartId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "set-status", status }),
    });
    if (!response.ok) throw new Error(await readError(response));
    return (await response.json()) as Chart;
  },

  async deleteChart(chartId: string): Promise<void> {
    const response = await fetch(`/api/charts/${chartId}`, { method: "DELETE" });
    if (!response.ok) throw new Error(await readError(response));
  },

  async createChart(draft: {
    personal: NonNullable<ChartDraft["personal"]>;
    dateTime: NonNullable<ChartDraft["dateTime"]>;
    location: NonNullable<ChartDraft["location"]>;
    configuration: NonNullable<ChartDraft["configuration"]>;
  }): Promise<{ chart: Chart; persisted: boolean; storageError?: string }> {
    const response = await fetch("/api/charts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(draft),
    });
    if (!response.ok) throw new Error(await readError(response));
    return (await response.json()) as {
      chart: Chart;
      persisted: boolean;
      storageError?: string;
    };
  },
};
