"use client";

/**
 * A chart card's readings line: how many categories are written, a status
 * light (green = complete, pulsing = being written on the server) and a
 * "Generate all" button that queues every missing category on the server,
 * so the phone can be locked meanwhile.
 */
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Check, Loader2, RotateCcw, Sparkles } from "lucide-react";
import type { Chart, ChartsReadingProgress } from "@/types";
import { ChartService } from "@/services/chart-service";
import { chartKeys } from "@/hooks/use-charts";
import { notify } from "@/components/common/toaster";
import { getDefaultStyle, getReadingLanguage } from "@/lib/reading-prefs";
import { cn } from "@/lib/utils";

type Progress = ChartsReadingProgress["charts"][string];

export function ReadingsStatus({
  chart,
  progress,
  total,
  canGenerate,
  className,
}: {
  chart: Chart;
  progress: Progress | undefined;
  /** Categories per chart (undefined while loading). */
  total: number | undefined;
  /** Hidden for sample charts and charts not calculated yet. */
  canGenerate: boolean;
  className?: string;
}) {
  const queryClient = useQueryClient();
  const [starting, setStarting] = useState(false);
  const complete = progress?.complete ?? 0;
  const busy = (progress?.queued ?? 0) > 0 || (progress?.running ?? null) !== null;
  const done = total !== undefined && complete >= total;
  const failed = !busy && (progress?.failed ?? 0) > 0;

  if (total === undefined || (!canGenerate && complete === 0)) return null;

  async function generateAll() {
    setStarting(true);
    try {
      const language = chart.configuration.language ?? getReadingLanguage();
      const queued = await ChartService.generateAll(chart.id, getDefaultStyle(), language);
      if (!queued) {
        notify("Writing in the background isn't set up: open the chart to generate its readings.", "info");
        return;
      }
      notify(`Writing ${chart.person.firstName}'s readings on the server: you can lock your phone.`);
      await queryClient.invalidateQueries({ queryKey: chartKeys.progress() });
    } catch (error) {
      notify(error instanceof Error ? `Could not start: ${error.message}` : "Could not start.", "info");
    } finally {
      setStarting(false);
    }
  }

  const label = done
    ? "Complete"
    : busy
      ? progress?.running !== null && progress?.running !== undefined
        ? `Writing ${progress.running}…`
        : `${progress?.queued} waiting for the server…`
      : failed
        ? `${progress?.failed} not written`
        : "Readings";

  return (
    <div className={cn("flex items-center gap-3 rounded-lg border border-line bg-surface px-3 py-2", className)}>
      <span className="relative flex h-2.5 w-2.5 shrink-0" aria-hidden="true">
        {busy && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-60" />}
        <span
          className={cn(
            "relative inline-flex h-2.5 w-2.5 rounded-full",
            done
              ? "bg-success shadow-[0_0_8px_hsl(var(--success)/0.8)]"
              : busy
                ? "bg-accent"
                : failed
                  ? "bg-danger"
                  : complete > 0
                    ? "bg-warning"
                    : "bg-line-strong",
          )}
        />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2 text-[11px]">
          <span
            className={cn(
              "truncate font-medium",
              done ? "text-success" : failed ? "text-danger" : "text-ink-secondary",
            )}
          >
            {label}
          </span>
          <span className="shrink-0 tabular-nums text-ink-muted">
            {complete}/{total}
          </span>
        </div>
        <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-surface-overlay">
          <div
            className={cn("h-full rounded-full transition-all duration-500", done ? "bg-success" : "bg-accent")}
            style={{ width: `${Math.min(100, Math.round((complete / Math.max(1, total)) * 100))}%` }}
          />
        </div>
      </div>
      {done ? (
        <Check size={15} className="shrink-0 text-success" aria-label="All categories written" />
      ) : busy ? (
        <Loader2 size={15} className="shrink-0 animate-spin text-accent-hover" aria-label="Writing" />
      ) : (
        canGenerate && (
          <button
            type="button"
            onClick={() => void generateAll()}
            disabled={starting}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-accent px-2.5 py-1.5 text-[11px] font-medium text-accent-foreground transition-colors hover:bg-accent-hover disabled:opacity-70"
          >
            {starting ? (
              <Loader2 size={12} className="animate-spin" />
            ) : failed ? (
              <RotateCcw size={12} />
            ) : (
              <Sparkles size={12} />
            )}
            {failed ? "Retry" : "Generate all"}
          </button>
        )
      )}
    </div>
  );
}
