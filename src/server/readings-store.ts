/**
 * Server-side reading store.
 *
 * Demo chart readings come from the seeded JSON (unchanged). Generated
 * readings for real charts persist to Supabase (RLS-scoped); memory is the
 * fallback for unconfigured/signed-out sessions, mirroring the chart store.
 */
import readingsJson from "@/data/sample-readings.json";
import { createSupabaseServerClient, getServerUserId } from "@/lib/supabase/server";
import { READING_DOMAINS } from "@/interpretation/domains";
import { scaffoldReading } from "@/interpretation/reading-pipeline";
import type { Chart, Reading, ReadingProgressSummary } from "@/types";

const demoReadings = readingsJson.readings as Reading[];
const DEMO_CHART_ID = demoReadings[0]?.chartId ?? "chart-clara-mercer";

/** chartId -> slug -> Reading (fallback storage per server instance). */
const memory = new Map<string, Map<string, Reading>>();

async function listStored(chartId: string): Promise<Reading[]> {
  const supabase = createSupabaseServerClient();
  if (supabase !== null) {
    const { data, error } = await supabase
      .from("readings")
      .select("reading")
      .eq("chart_id", chartId);
    if (error === null && data !== null && data.length > 0) {
      return data.map((row) => row.reading as Reading);
    }
  }
  return [...(memory.get(chartId)?.values() ?? [])];
}

export const ReadingsStore = {
  /** Full domain list: stored generated readings + scaffolds for the rest. */
  async listReadings(chart: Chart): Promise<Reading[]> {
    if (chart.id === DEMO_CHART_ID) return demoReadings;
    const stored = await listStored(chart.id);
    const bySlug = new Map(stored.map((r) => [r.slug, r]));
    return READING_DOMAINS.map((domain) => bySlug.get(domain.slug) ?? scaffoldReading(chart, domain));
  },

  async getReading(chart: Chart, slug: string): Promise<Reading | undefined> {
    const all = await this.listReadings(chart);
    return all.find((r) => r.slug === slug);
  },

  /**
   * How many topic readings each of the signed-in user's charts has written,
   * for the library cards: only the status is read, never the readings.
   */
  async completedByChart(): Promise<Record<string, number>> {
    const topics = new Set(READING_DOMAINS.map((domain) => domain.slug));
    const counts: Record<string, number> = {};
    const count = (chartId: string, slug: string, status: unknown) => {
      if (topics.has(slug) && status === "complete") counts[chartId] = (counts[chartId] ?? 0) + 1;
    };
    const supabase = createSupabaseServerClient();
    if (supabase !== null) {
      const PAGE = 1000; // the database's row cap per request
      for (let from = 0; ; from += PAGE) {
        const { data, error } = await supabase
          .from("readings")
          .select("chart_id, slug, status:reading->>status")
          .order("chart_id")
          .order("slug")
          .range(from, from + PAGE - 1);
        if (error !== null || data === null) break;
        for (const row of data as { chart_id: string; slug: string; status: unknown }[]) {
          count(row.chart_id, row.slug, row.status);
        }
        if (data.length < PAGE) break;
      }
    }
    for (const [chartId, bySlug] of memory) {
      if (counts[chartId] !== undefined) continue; // already counted from the database
      for (const reading of bySlug.values()) count(chartId, reading.slug, reading.status);
    }
    for (const reading of demoReadings) count(DEMO_CHART_ID, reading.slug, reading.status);
    return counts;
  },

  async getProgress(chart: Chart): Promise<ReadingProgressSummary> {
    const all = await this.listReadings(chart);
    const completed = all.filter((r) => r.status === "complete").length;
    return {
      completed,
      total: all.length,
      overall: Math.round((completed / Math.max(1, all.length)) * 100),
    };
  },

  /** A stored reading by its exact slug (synastry and other non-topic readings). */
  async getStored(chartId: string, slug: string): Promise<Reading | null> {
    const supabase = createSupabaseServerClient();
    if (supabase !== null) {
      const { data, error } = await supabase
        .from("readings")
        .select("reading")
        .eq("chart_id", chartId)
        .eq("slug", slug)
        .maybeSingle();
      if (error === null && data !== null) return data.reading as Reading;
    }
    return memory.get(chartId)?.get(slug) ?? null;
  },

  /** Every stored reading whose slug starts with `prefix` (the signed-in user's). */
  async listStoredByPrefix(prefix: string): Promise<Reading[]> {
    const found: Reading[] = [];
    const supabase = createSupabaseServerClient();
    if (supabase !== null) {
      // "_" and "%" are LIKE wildcards: match the prefix literally.
      const literal = prefix.replace(/[\\%_]/g, (c) => `\\${c}`);
      const { data, error } = await supabase.from("readings").select("reading").like("slug", `${literal}%`);
      if (error === null && data !== null) found.push(...data.map((row) => row.reading as Reading));
    }
    for (const byChart of memory.values()) {
      for (const [slug, reading] of byChart) if (slug.startsWith(prefix)) found.push(reading);
    }
    return found;
  },

  async deleteStored(chartId: string, slug: string): Promise<void> {
    const supabase = createSupabaseServerClient();
    if (supabase !== null) await supabase.from("readings").delete().eq("chart_id", chartId).eq("slug", slug);
    memory.get(chartId)?.delete(slug);
  },

  /** Persist a generated reading (upsert on chart+slug). */
  async saveReading(chart: Chart, reading: Reading): Promise<{ persisted: boolean }> {
    const supabase = createSupabaseServerClient();
    const userId = await getServerUserId();
    if (supabase !== null && userId !== null) {
      const { error } = await supabase.from("readings").upsert(
        {
          chart_id: chart.id,
          user_id: userId,
          slug: reading.slug,
          reading,
          engine_version: "reading-engine-1.0",
          updated_at: new Date().toISOString(),
        },
        { onConflict: "chart_id,slug" },
      );
      if (error === null) return { persisted: true };
    }
    const forChart = memory.get(chart.id) ?? new Map<string, Reading>();
    forChart.set(reading.slug, reading);
    memory.set(chart.id, forChart);
    return { persisted: false };
  },
};

/* ------------------- overview AI interpretation ---------------------- */
/**
 * The chart-level AI interpretation is persisted in the same readings
 * table under a reserved slug, so no extra migration is needed. Reserved
 * slugs never collide with domain slugs and never appear in domain lists.
 */
const OVERVIEW_AI_SLUG = "_overview_ai";

export interface SavedAiInterpretation {
  text: string;
  model: string;
  generatedAt: string;
}

const memoryAi = new Map<string, SavedAiInterpretation>();

export const AiInterpretationStore = {
  async get(chartId: string): Promise<SavedAiInterpretation | null> {
    const supabase = createSupabaseServerClient();
    if (supabase !== null) {
      const { data, error } = await supabase
        .from("readings")
        .select("reading")
        .eq("chart_id", chartId)
        .eq("slug", OVERVIEW_AI_SLUG)
        .maybeSingle();
      if (error === null && data !== null) {
        return data.reading as SavedAiInterpretation;
      }
    }
    return memoryAi.get(chartId) ?? null;
  },

  async save(chartId: string, value: SavedAiInterpretation): Promise<void> {
    const supabase = createSupabaseServerClient();
    const userId = await getServerUserId();
    if (supabase !== null && userId !== null) {
      const { error } = await supabase.from("readings").upsert(
        {
          chart_id: chartId,
          user_id: userId,
          slug: OVERVIEW_AI_SLUG,
          reading: value,
          engine_version: "overview-ai-1.0",
          updated_at: new Date().toISOString(),
        },
        { onConflict: "chart_id,slug" },
      );
      if (error === null) return;
    }
    memoryAi.set(chartId, value);
  },
};

/* ------------------------- report edits ------------------------------ */
const REPORT_EDITS_SLUG = "_report_edits";
const memoryEdits = new Map<string, Record<string, string[]>>();

export const ReportEditsStore = {
  async get(chartId: string): Promise<Record<string, string[]>> {
    const supabase = createSupabaseServerClient();
    if (supabase !== null) {
      const { data, error } = await supabase
        .from("readings")
        .select("reading")
        .eq("chart_id", chartId)
        .eq("slug", REPORT_EDITS_SLUG)
        .maybeSingle();
      if (error === null && data !== null) {
        return data.reading as Record<string, string[]>;
      }
    }
    return memoryEdits.get(chartId) ?? {};
  },

  async saveSection(
    chartId: string,
    sectionId: string,
    paragraphs: string[],
  ): Promise<void> {
    const current = await this.get(chartId);
    const next = { ...current, [sectionId]: paragraphs };
    const supabase = createSupabaseServerClient();
    const userId = await getServerUserId();
    if (supabase !== null && userId !== null) {
      const { error } = await supabase.from("readings").upsert(
        {
          chart_id: chartId,
          user_id: userId,
          slug: REPORT_EDITS_SLUG,
          reading: next,
          engine_version: "report-edits-1.0",
          updated_at: new Date().toISOString(),
        },
        { onConflict: "chart_id,slug" },
      );
      if (error === null) return;
    }
    memoryEdits.set(chartId, next);
  },
};

/* --------------------- astrologer notes per reading ------------------- */
export interface AstrologerNote {
  text: string;
  createdAt: string;
}

const memoryNotes = new Map<string, AstrologerNote[]>();

function noteSlug(slug: string): string {
  return `_note_${slug}`;
}

export const NotesStore = {
  async list(chartId: string, slug: string): Promise<AstrologerNote[]> {
    const supabase = createSupabaseServerClient();
    if (supabase !== null) {
      const { data, error } = await supabase
        .from("readings")
        .select("reading")
        .eq("chart_id", chartId)
        .eq("slug", noteSlug(slug))
        .maybeSingle();
      if (error === null && data !== null) {
        const value = data.reading as { entries?: AstrologerNote[] };
        return value.entries ?? [];
      }
    }
    return memoryNotes.get(`${chartId}/${slug}`) ?? [];
  },

  async add(chartId: string, slug: string, text: string): Promise<AstrologerNote[]> {
    const entry: AstrologerNote = { text, createdAt: new Date().toISOString() };
    const current = await this.list(chartId, slug);
    const next = [entry, ...current].slice(0, 100);
    const supabase = createSupabaseServerClient();
    const userId = await getServerUserId();
    if (supabase !== null && userId !== null) {
      const { error } = await supabase.from("readings").upsert(
        {
          chart_id: chartId,
          user_id: userId,
          slug: noteSlug(slug),
          reading: { entries: next },
          engine_version: "notes-1.0",
          updated_at: new Date().toISOString(),
        },
        { onConflict: "chart_id,slug" },
      );
      if (error === null) return next;
    }
    memoryNotes.set(`${chartId}/${slug}`, next);
    return next;
  },
};
