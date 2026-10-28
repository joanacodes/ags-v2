/**
 * The shape of every run: a studio_runs row first, the work, the row closed with what it cost and what it
 * wrote, whatever happens. A run that throws is closed as failed with the error; nothing fails silently.
 */
import type { StudioStore } from "./store/store";
import type { RunRow } from "./store/rows";
import { addUsage, NO_USAGE, type Usage } from "./models";
import type { RunOutcome, RunTrigger } from "./types";

export class RunLog {
  usage: Usage = NO_USAGE;
  costUsd = 0;
  model: string | null = null;
  readonly wrote: Record<string, number> = {};
  readonly notes: string[] = [];
  readonly details: Record<string, unknown> = {};

  add(usage: Usage, costUsd: number, model?: string) {
    this.usage = addUsage(this.usage, usage);
    this.costUsd += costUsd;
    if (model) this.model = model;
  }
  count(table: string, n = 1) {
    this.wrote[table] = (this.wrote[table] ?? 0) + n;
  }
  note(line: string) {
    this.notes.push(line);
    // The worker's console is the run's log on GitHub Actions; the row keeps the last lines.
    console.log(`[studio] ${line}`);
  }
}

export interface RunResult {
  readonly outcome: RunOutcome;
  readonly error?: string | null;
}

export class SkipRun extends Error {
  constructor(readonly outcome: "capped" | "skipped" | "dry_run", message: string) {
    super(message);
  }
}

export async function withRun(
  store: StudioStore,
  start: { agent: string; trigger: RunTrigger; model?: string | null; promptVersion?: number | null; details?: Record<string, unknown> },
  work: (log: RunLog, run: RunRow) => Promise<RunResult | void>,
): Promise<{ run: RunRow; outcome: RunOutcome; error: string | null; log: RunLog }> {
  const run = await store.startRun(start);
  const log = new RunLog();
  const logUrl =
    process.env.GITHUB_SERVER_URL && process.env.GITHUB_REPOSITORY && process.env.GITHUB_RUN_ID
      ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`
      : null;
  let outcome: RunOutcome = "ok";
  let error: string | null = null;
  try {
    const result = await work(log, run);
    if (result) {
      outcome = result.outcome;
      error = result.error ?? null;
    }
  } catch (err) {
    if (err instanceof SkipRun) {
      outcome = err.outcome;
      error = err.message;
      log.note(err.message);
    } else {
      outcome = "failed";
      error = err instanceof Error ? err.message : String(err);
      log.note(`failed: ${error}`);
    }
  }
  await store.finishRun(run.id, {
    outcome,
    usage: log.usage,
    costUsd: Math.round(log.costUsd * 1_000_000) / 1_000_000,
    model: log.model,
    wrote: log.wrote,
    error,
    logUrl,
    details: { ...log.details, notes: log.notes.slice(-40) },
  });
  return { run, outcome, error, log };
}
