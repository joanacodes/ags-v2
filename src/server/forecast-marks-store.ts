/**
 * Look-back marks (TASK-0015): for a period the forecast found in someone's past, whether they recognise it. Kept
 * per signed-in owner in Supabase (forecast_marks, RLS on the owner); until that migration is run, or without
 * Supabase, they are kept in this server's memory only, and every answer says which, so a test session never
 * believes its marks were saved when they were not.
 */
import { createSupabaseServerClient, getServerUserId } from "@/lib/supabase/server";

export type Verdict = "yes" | "no";

export interface ForecastMark {
  readonly key: string;
  readonly verdict: Verdict;
  /** What the period was, as shown when it was marked ("Saturn square Sun, 2019"), for reading the marks later. */
  readonly label: string;
  readonly technique: string;
  readonly score: number;
  readonly updatedAt: string;
}

export interface MarksAnswer {
  readonly marks: readonly ForecastMark[];
  /** False when the marks live only in this server's memory. */
  readonly persisted: boolean;
}

const memory = new Map<string, Map<string, ForecastMark>>();

interface MarkRow {
  key: string;
  verdict: Verdict;
  label: string;
  technique: string;
  score: number;
  updated_at: string;
}

const fromRow = (r: MarkRow): ForecastMark => ({ key: r.key, verdict: r.verdict, label: r.label, technique: r.technique, score: Number(r.score), updatedAt: r.updated_at });

function memoryOf(chartId: string): Map<string, ForecastMark> {
  let marks = memory.get(chartId);
  if (!marks) {
    marks = new Map();
    memory.set(chartId, marks);
  }
  return marks;
}

export const ForecastMarksStore = {
  async list(chartId: string): Promise<MarksAnswer> {
    const supabase = createSupabaseServerClient();
    if (supabase !== null && (await getServerUserId()) !== null) {
      const { data, error } = await supabase.from("forecast_marks").select("key, verdict, label, technique, score, updated_at").eq("chart_id", chartId);
      if (!error) return { marks: (data as MarkRow[]).map(fromRow), persisted: true };
    }
    return { marks: [...memoryOf(chartId).values()], persisted: false };
  },

  /** Sets a mark, or clears it when the verdict is null. */
  async set(chartId: string, mark: { key: string; verdict: Verdict | null; label: string; technique: string; score: number }): Promise<MarksAnswer> {
    const supabase = createSupabaseServerClient();
    const userId = supabase !== null ? await getServerUserId() : null;
    if (supabase !== null && userId !== null) {
      const result =
        mark.verdict === null
          ? await supabase.from("forecast_marks").delete().eq("chart_id", chartId).eq("key", mark.key)
          : await supabase
              .from("forecast_marks")
              .upsert(
                { user_id: userId, chart_id: chartId, key: mark.key, verdict: mark.verdict, label: mark.label, technique: mark.technique, score: mark.score, updated_at: new Date().toISOString() },
                { onConflict: "user_id,chart_id,key" },
              );
      if (!result.error) return this.list(chartId);
    }
    const marks = memoryOf(chartId);
    if (mark.verdict === null) marks.delete(mark.key);
    else marks.set(mark.key, { key: mark.key, verdict: mark.verdict, label: mark.label, technique: mark.technique, score: mark.score, updatedAt: new Date().toISOString() });
    return { marks: [...marks.values()], persisted: false };
  },
};
