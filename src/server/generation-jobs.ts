/**
 * Background reading generation.
 *
 * "Generate all categories" queues one job per missing reading
 * (`generation_jobs`). A Cloudflare timer calls the runner every minute; it
 * writes the queued readings one at a time on the server, with the secret
 * key, on behalf of the person who queued them. Nothing depends on the
 * phone staying awake.
 */
import {
  createSupabaseServerClient,
  createSupabaseServiceClient,
  getServerUserId,
  runAsUser,
} from "@/lib/supabase/server";
import { ChartsStore } from "@/server/charts-store";
import { ReadingsStore } from "@/server/readings-store";
import { PromptsStore } from "@/server/prompts-store";
import { generateDomainReading } from "@/interpretation/reading-pipeline";
import { getDomain } from "@/interpretation/domains";

export type JobStatus = "queued" | "running" | "done" | "failed";

interface JobRow {
  id: string;
  user_id: string;
  chart_id: string;
  slug: string;
  position: number;
  style: string;
  language: string;
  status: JobStatus;
  attempts: number;
  error: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
}

export interface ChartJobsSummary {
  /** False until the database table and server keys are set up. */
  available: boolean;
  queued: number;
  running: { slug: string; title: string } | null;
  failed: { slug: string; title: string; error: string }[];
}

export class BackgroundUnavailableError extends Error {}

const MAX_ATTEMPTS = 2;

/** The runner needs the secret key; the cron call is checked with CRON_SECRET. */
export function backgroundConfigured(): boolean {
  return createSupabaseServiceClient() !== null && (process.env.CRON_SECRET ?? "").trim() !== "";
}

function titleOf(slug: string): string {
  return getDomain(slug)?.shortTitle ?? slug;
}

export const GenerationJobs = {
  /** Queue every reading of the chart that is not written yet. */
  async enqueue(chartId: string, style: string, language: string): Promise<{ queued: number }> {
    if (!backgroundConfigured()) throw new BackgroundUnavailableError("Background generation is not set up.");
    const supabase = createSupabaseServerClient();
    const userId = await getServerUserId();
    if (supabase === null || userId === null) throw new BackgroundUnavailableError("Sign in first.");

    const chart = await ChartsStore.getChart(chartId);
    const readings = await ReadingsStore.listReadings(chart);
    const { data: active, error: activeError } = await supabase
      .from("generation_jobs")
      .select("slug")
      .eq("chart_id", chartId)
      .in("status", ["queued", "running"]);
    if (activeError !== null) throw new BackgroundUnavailableError(activeError.message);
    const already = new Set((active ?? []).map((row: { slug: string }) => row.slug));

    const rows = readings
      .filter((r) => r.status !== "complete" && !already.has(r.slug))
      .map((r, index) => ({ user_id: userId, chart_id: chartId, slug: r.slug, position: index, style, language }));
    // Clear earlier failures for these readings so the status is fresh.
    await supabase.from("generation_jobs").delete().eq("chart_id", chartId).in("status", ["failed", "done"]);
    if (rows.length === 0) return { queued: 0 };
    const { error } = await supabase.from("generation_jobs").insert(rows);
    if (error !== null) throw new BackgroundUnavailableError(error.message);
    return { queued: rows.length };
  },

  async summary(chartId: string): Promise<ChartJobsSummary> {
    const empty: ChartJobsSummary = { available: false, queued: 0, running: null, failed: [] };
    if (!backgroundConfigured()) return empty;
    const supabase = createSupabaseServerClient();
    if (supabase === null) return empty;
    const { data, error } = await supabase
      .from("generation_jobs")
      .select("slug, status, error")
      .eq("chart_id", chartId)
      .in("status", ["queued", "running", "failed"]);
    if (error !== null) return empty; // table missing: migration not run yet
    const rows = (data ?? []) as Pick<JobRow, "slug" | "status" | "error">[];
    const running = rows.find((r) => r.status === "running");
    return {
      available: true,
      queued: rows.filter((r) => r.status === "queued").length,
      running: running === undefined ? null : { slug: running.slug, title: titleOf(running.slug) },
      failed: rows
        .filter((r) => r.status === "failed")
        .map((r) => ({ slug: r.slug, title: titleOf(r.slug), error: r.error ?? "Failed." })),
    };
  },

  /** Stop: drop what has not started yet (the running reading finishes). */
  async cancel(chartId: string): Promise<void> {
    const supabase = createSupabaseServerClient();
    if (supabase === null) return;
    await supabase.from("generation_jobs").delete().eq("chart_id", chartId).eq("status", "queued");
  },

  /**
   * Work through the queue until it is empty or `budgetMs` is used up
   * (a started reading always finishes). Called by the Cloudflare timer.
   */
  async runQueue(budgetMs: number): Promise<{ processed: number }> {
    const service = createSupabaseServiceClient();
    if (service === null) return { processed: 0 };
    const startedAt = Date.now();
    let processed = 0;
    while (Date.now() - startedAt < budgetMs) {
      const { data, error } = await service.rpc("claim_generation_job");
      if (error !== null) {
        console.error(`[jobs] claim failed: ${error.message}`);
        break;
      }
      const job = ((data ?? []) as JobRow[])[0];
      if (job === undefined) break;
      processed += 1;

      let failure: { message: string; final: boolean } | null = null;
      try {
        failure = await runAsUser(service, job.user_id, async () => {
          const chart = await ChartsStore.getChart(job.chart_id);
          const current = await ReadingsStore.getReading(chart, job.slug);
          if (current?.status === "complete") return null; // written meanwhile
          const outcome = await generateDomainReading(chart, job.slug, job.style, job.language, {
            prompts: await PromptsStore.getPrompts(),
          });
          if (outcome.status === "ok") {
            await ReadingsStore.saveReading(chart, outcome.reading);
            return null;
          }
          if (outcome.status === "refused") return { message: outcome.message, final: true };
          if (outcome.status === "no_api_key") return { message: "No AI key on the server.", final: true };
          if (outcome.status === "no_placements") {
            return { message: "Calculate the chart first.", final: true };
          }
          return { message: outcome.message, final: false };
        });
      } catch (caught) {
        failure = { message: caught instanceof Error ? caught.message : String(caught), final: false };
      }

      const retry = failure !== null && !failure.final && job.attempts < MAX_ATTEMPTS;
      await service
        .from("generation_jobs")
        .update({
          status: failure === null ? "done" : retry ? "queued" : "failed",
          error: failure?.message.slice(0, 500) ?? null,
          finished_at: retry ? null : new Date().toISOString(),
        })
        .eq("id", job.id);
    }
    return { processed };
  },
};
