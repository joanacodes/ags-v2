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
import { generateSynastryReading } from "@/interpretation/synastry-pipeline";
import { isSynastrySlug } from "@/interpretation/synastry";
import { getDomain } from "@/interpretation/domains";
import { SynastryStore, isSynastryReading } from "@/server/synastry-store";
import type { SupabaseClient } from "@supabase/supabase-js";

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
  if (isSynastrySlug(slug)) return "Synastry";
  return getDomain(slug)?.shortTitle ?? slug;
}

type JobFailure = { message: string; final: boolean } | null;

/** Write one topic reading. Runs as the job's owner. */
async function processReadingJob(job: JobRow): Promise<JobFailure> {
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
  return outcomeFailure(outcome);
}

/** Write one synastry reading. Runs as the job's owner. */
async function processSynastryJob(job: JobRow, service: SupabaseClient): Promise<JobFailure> {
  // The stored record names the partner chart (the slug only holds a hash).
  const stored = await ReadingsStore.getStored(job.chart_id, job.slug);
  const partnerId = isSynastryReading(stored) ? stored.partnerChartId : undefined;
  if (partnerId === undefined) return { message: "This synastry no longer exists.", final: true };
  // The secret key bypasses row security: check the partner chart is this person's own.
  if (!ChartsStore.isSample(partnerId)) {
    const { data } = await service.from("charts").select("user_id").eq("id", partnerId).maybeSingle();
    if ((data as { user_id?: string } | null)?.user_id !== job.user_id) {
      return { message: "The other chart is no longer available.", final: true };
    }
  }
  const owner = await ChartsStore.getChart(job.chart_id);
  const partner = await ChartsStore.getChart(partnerId);
  const outcome = await generateSynastryReading(owner, partner, job.style, job.language, {
    prompts: await PromptsStore.getPrompts(),
  });
  if (outcome.status === "ok") {
    await SynastryStore.save(owner, outcome.reading);
    return null;
  }
  return outcomeFailure(outcome);
}

type FailedOutcome =
  | { status: "refused"; message: string }
  | { status: "provider_error"; message: string }
  | { status: "no_api_key" }
  | { status: "no_placements" };

function outcomeFailure(outcome: FailedOutcome): JobFailure {
  if (outcome.status === "refused") return { message: outcome.message, final: true };
  if (outcome.status === "no_api_key") return { message: "No AI key on the server.", final: true };
  if (outcome.status === "no_placements") return { message: "Calculate the chart first.", final: true };
  return { message: outcome.message, final: false };
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

  /** Queue one reading (used for a synastry); a no-op if it is already queued. */
  async enqueueOne(chartId: string, slug: string, style: string, language: string): Promise<void> {
    if (!backgroundConfigured()) throw new BackgroundUnavailableError("Background generation is not set up.");
    const supabase = createSupabaseServerClient();
    const userId = await getServerUserId();
    if (supabase === null || userId === null) throw new BackgroundUnavailableError("Sign in first.");
    const { data: active, error: activeError } = await supabase
      .from("generation_jobs")
      .select("id")
      .eq("chart_id", chartId)
      .eq("slug", slug)
      .in("status", ["queued", "running"]);
    if (activeError !== null) throw new BackgroundUnavailableError(activeError.message);
    if ((active ?? []).length > 0) return;
    await supabase.from("generation_jobs").delete().eq("chart_id", chartId).eq("slug", slug).in("status", ["failed", "done"]);
    const { error } = await supabase
      .from("generation_jobs")
      .insert({ user_id: userId, chart_id: chartId, slug, position: 0, style, language });
    if (error !== null) throw new BackgroundUnavailableError(error.message);
  },

  /** State of one reading's latest job, or null when there is none to show. */
  async jobFor(chartId: string, slug: string): Promise<{ status: JobStatus; error: string | null } | null> {
    if (!backgroundConfigured()) return null;
    const supabase = createSupabaseServerClient();
    if (supabase === null) return null;
    const { data, error } = await supabase
      .from("generation_jobs")
      .select("status, error, created_at")
      .eq("chart_id", chartId)
      .eq("slug", slug)
      .in("status", ["queued", "running", "failed"])
      .order("created_at", { ascending: false })
      .limit(1);
    if (error !== null || data === null || data.length === 0) return null;
    const row = data[0] as { status: JobStatus; error: string | null };
    return { status: row.status, error: row.error };
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
    // Synastry jobs show on their own page, not in the chart's categories.
    const rows = ((data ?? []) as Pick<JobRow, "slug" | "status" | "error">[]).filter(
      (r) => !isSynastrySlug(r.slug),
    );
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

      let failure: JobFailure = null;
      try {
        failure = await runAsUser(service, job.user_id, () =>
          isSynastrySlug(job.slug) ? processSynastryJob(job, service) : processReadingJob(job),
        );
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
