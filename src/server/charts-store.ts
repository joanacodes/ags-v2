/**
 * Server-side chart store: the single source of truth for chart data.
 *
 * Demo charts come from the seeded JSON; user charts live in Supabase
 * (RLS-scoped to the signed-in user). When Supabase is not configured or
 * nobody is signed in, creation falls back to an in-memory session list so
 * the app keeps its historical mock behaviour.
 */
import chartsJson from "@/data/sample-charts.json";
import workspaceJson from "@/data/workspace.json";
import { createSupabaseServerClient, getServerUserId } from "@/lib/supabase/server";
import { calculateChart } from "@/server/providers/freeastroapi";
import { resolveAiModel } from "@/interpretation/ai-models";
import type { Chart, ChartDraft, ChartLibraryStats, ChartStatus } from "@/types";

const seededCharts = chartsJson.charts as Chart[];
/** Fallback for unconfigured/signed-out mode (per server instance). */
const memoryCharts: Chart[] = [];

interface ChartRow {
  id: string;
  chart_payload: Chart;
  favourite: boolean;
  status: string;
  created_at: string;
  updated_at: string;
}

function rowToChart(row: ChartRow): Chart {
  return {
    ...row.chart_payload,
    id: row.id,
    favourite: row.favourite,
    status: row.status as ChartStatus,
  };
}

async function listDbCharts(): Promise<Chart[]> {
  const supabase = createSupabaseServerClient();
  if (supabase === null) return [];
  const { data, error } = await supabase
    .from("charts")
    .select("id, chart_payload, favourite, status, created_at, updated_at")
    .order("updated_at", { ascending: false });
  if (error !== null || data === null) return [];
  return (data as ChartRow[]).map(rowToChart);
}

export const ChartsStore = {
  /** User charts (newest first), then in-memory session charts, then demos. */
  async listCharts(): Promise<Chart[]> {
    const dbCharts = await listDbCharts();
    return [...dbCharts, ...memoryCharts, ...seededCharts];
  },

  async getChart(chartId: string): Promise<Chart> {
    const local = [...memoryCharts, ...seededCharts].find((c) => c.id === chartId);
    if (local !== undefined) return local;
    const supabase = createSupabaseServerClient();
    if (supabase !== null) {
      const { data } = await supabase
        .from("charts")
        .select("id, chart_payload, favourite, status, created_at, updated_at")
        .eq("id", chartId)
        .maybeSingle();
      if (data !== null) return rowToChart(data as ChartRow);
    }
    throw new Error(`Chart not found: ${chartId}`);
  },

  async getLibraryStats(): Promise<ChartLibraryStats> {
    const base = workspaceJson.library;
    const dbCharts = await listDbCharts();
    const extra = [...dbCharts, ...memoryCharts];
    return {
      total: base.total + extra.length,
      favourited: base.favourited + extra.filter((c) => c.favourite).length,
      active: base.active + extra.filter((c) => c.status === "active").length,
      archived: base.archived + extra.filter((c) => c.status === "archived").length,
    };
  },

  async toggleFavourite(chartId: string): Promise<Chart> {
    const supabase = createSupabaseServerClient();
    if (supabase !== null) {
      const { data } = await supabase
        .from("charts")
        .select("id, chart_payload, favourite, status, created_at, updated_at")
        .eq("id", chartId)
        .maybeSingle();
      if (data !== null) {
        const row = data as ChartRow;
        const { data: updated, error } = await supabase
          .from("charts")
          .update({ favourite: !row.favourite, updated_at: new Date().toISOString() })
          .eq("id", chartId)
          .select("id, chart_payload, favourite, status, created_at, updated_at")
          .single();
        if (error === null && updated !== null) return rowToChart(updated as ChartRow);
      }
    }
    // Demo / in-memory fallback: mutate the local object.
    const local = [...memoryCharts, ...seededCharts].find((c) => c.id === chartId);
    if (local === undefined) throw new Error(`Chart not found: ${chartId}`);
    local.favourite = !local.favourite;
    return local;
  },

  /**
   * Create a chart from the wizard draft. Persists to Supabase when a user
   * is signed in; otherwise falls back to the in-memory session list.
   * Returns the chart plus where it was stored.
   */
  async createChart(draft: {
    personal: NonNullable<ChartDraft["personal"]>;
    dateTime: NonNullable<ChartDraft["dateTime"]>;
    location: NonNullable<ChartDraft["location"]>;
    configuration: NonNullable<ChartDraft["configuration"]>;
  }): Promise<{ chart: Chart; persisted: boolean; storageError?: string }> {
    const { personal, dateTime, location, configuration } = draft;
    const id = `chart-${personal.firstName}-${personal.lastName}-${Date.now()}`
      .toLowerCase()
      .replace(/\s+/g, "-");

    const chart: Chart = {
      id,
      person: {
        id: `person-${id}`,
        firstName: personal.firstName,
        lastName: personal.lastName,
        gender: personal.gender,
        notes: personal.notes,
      },
      birth: {
        date: dateTime.birthDate,
        time: dateTime.unknownTime ? undefined : dateTime.birthTime,
        timeKnown: !dateTime.unknownTime,
        place: location.birthPlace,
        country: location.country,
        timezone: location.timezone,
        utcOffset: location.utcOffset ?? "UTC +0:00",
        latitude: location.latitude ?? 0,
        longitude: location.longitude ?? 0,
      },
      configuration: {
        houseSystem: configuration.houseSystem,
        zodiac: "Tropical",
        ephemeris: "Swiss Ephemeris",
        language: draft.configuration?.language,
        aiModel: resolveAiModel(configuration.aiModel),
      },
      planets: [],
      houses: [],
      angles: [],
      aspects: [],
      summary: {
        sun: { degree: 0, minute: 0, sign: "Aries", house: 1 },
        moon: { degree: 0, minute: 0, sign: "Aries", house: 1 },
        ascendant: { degree: 0, minute: 0, sign: "Aries" },
        chartRuler: { planet: "Mars", position: "Pending calculation" },
        dominantElement: "Fire",
        dominantModality: "Cardinal",
        dominantPlanets: [],
        strongestHouses: [],
        majorThemes: [],
        insights: [],
      },
      status: "processing" as ChartStatus,
      favourite: false,
      confidenceScore: 0,
      createdAt: new Date().toISOString(),
      lastOpenedAt: new Date().toISOString(),
      lastOpenedLabel: "Just now",
    };

    // Real calculation via FreeAstroAPI (stays "processing" when the
    // provider is not configured; "failed" on provider errors, so the UI
    // can offer a retry).
    let finalChart = chart;
    const outcome = await calculateChart(chart);
    if (outcome.status === "ok") finalChart = outcome.chart;
    else if (outcome.status === "failed") finalChart = { ...chart, status: "failed" };

    const supabase = createSupabaseServerClient();
    const userId = await getServerUserId();
    let storageError: string | undefined;
    if (supabase !== null && userId !== null) {
      const { error } = await supabase.from("charts").insert({
        id: finalChart.id,
        user_id: userId,
        first_name: finalChart.person.firstName,
        last_name: finalChart.person.lastName,
        status: finalChart.status,
        favourite: finalChart.favourite,
        chart_payload: finalChart,
      });
      if (error === null) return { chart: finalChart, persisted: true };
      // NEVER silent: surface the database error so the UI can show it.
      storageError = `Database insert failed: ${error.message}`;
    } else if (supabase === null) {
      storageError = "Supabase is not configured (missing NEXT_PUBLIC_SUPABASE_* variables).";
    } else {
      storageError = "Not signed in — the chart lives in this session only.";
    }
    memoryCharts.unshift(finalChart);
    return { chart: finalChart, persisted: false, storageError };
  },

  /** Archive/unarchive a chart (demo charts refused). */
  async setStatus(chartId: string, status: "active" | "archived"): Promise<Chart> {
    if (seededCharts.some((c) => c.id === chartId)) {
      throw new Error("Demo charts are fixed sample data.");
    }
    const supabase = createSupabaseServerClient();
    if (supabase !== null) {
      const { data } = await supabase
        .from("charts")
        .update({ status, updated_at: new Date().toISOString() })
        .eq("id", chartId)
        .select("id, chart_payload, favourite, status, created_at, updated_at")
        .maybeSingle();
      if (data !== null) return rowToChart(data as ChartRow);
    }
    const local = memoryCharts.find((c) => c.id === chartId);
    if (local === undefined) throw new Error(`Chart not found: ${chartId}`);
    local.status = status;
    return local;
  },

  /** Delete a chart and its readings (demo charts refused). */
  async deleteChart(chartId: string): Promise<void> {
    if (seededCharts.some((c) => c.id === chartId)) {
      throw new Error("Demo charts are fixed sample data.");
    }
    const supabase = createSupabaseServerClient();
    if (supabase !== null) {
      await supabase.from("charts").delete().eq("id", chartId); // readings cascade
    }
    const index = memoryCharts.findIndex((c) => c.id === chartId);
    if (index >= 0) memoryCharts.splice(index, 1);
  },

  /**
   * (Re)calculate an existing chart's placements. Demo charts are refused;
   * persisted charts are updated in place, session charts in memory.
   */
  async recalculateChart(chartId: string): Promise<
    | { status: "ok"; chart: Chart }
    | { status: "not_configured" }
    | { status: "failed"; message: string }
    | { status: "demo" }
  > {
    if (seededCharts.some((c) => c.id === chartId)) return { status: "demo" };
    const chart = await this.getChart(chartId);
    const outcome = await calculateChart(chart);
    if (outcome.status !== "ok") return outcome;

    const supabase = createSupabaseServerClient();
    if (supabase !== null) {
      const { data } = await supabase
        .from("charts")
        .update({
          chart_payload: outcome.chart,
          status: outcome.chart.status,
          updated_at: new Date().toISOString(),
        })
        .eq("id", chartId)
        .select("id")
        .maybeSingle();
      if (data !== null) return { status: "ok", chart: outcome.chart };
    }
    const index = memoryCharts.findIndex((c) => c.id === chartId);
    if (index >= 0) memoryCharts[index] = outcome.chart;
    return { status: "ok", chart: outcome.chart };
  },
};
