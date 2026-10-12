"use client";

import { AlertTriangle, Check, Loader2, Pause, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useGenerateAll } from "@/hooks/use-generate-all";
import { cn } from "@/lib/utils";

/** "Generate all categories" with live progress, for one chart. */
export function GenerateAllCard({
  chartId,
  language,
  missing,
  total,
  className,
}: {
  chartId: string;
  language?: string;
  /** Readings not written yet (undefined while loading). */
  missing: number | undefined;
  total: number | undefined;
  className?: string;
}) {
  const { state, start, running } = useGenerateAll(chartId, language);
  const allDone = missing === 0 && !running;

  return (
    <Card className={cn("p-4 sm:p-5", className)}>
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-ink">All reading categories</p>
          <p className="pt-0.5 text-xs leading-relaxed text-ink-muted">
            {state.kind === "running" ? (
              <>
                Writing {state.current}… {state.done + 1}/{state.total}. Your screen stays on while it
                works.
              </>
            ) : state.kind === "paused" ? (
              <>Paused while the phone was locked — it picks up again as soon as you&apos;re back.</>
            ) : state.kind === "error" ? (
              <span className="text-danger">
                Stopped after {state.done}/{state.total}: {state.message}
              </span>
            ) : allDone ? (
              <>Every category is written.</>
            ) : missing !== undefined && total !== undefined ? (
              <>
                {missing} of {total} still to write, one after the other.
              </>
            ) : (
              <>Loading…</>
            )}
          </p>
        </div>
        <Button
          variant="primary"
          size="md"
          onClick={() => void start()}
          disabled={running || allDone || missing === undefined}
          className="w-full sm:w-auto"
        >
          {state.kind === "running" ? (
            <Loader2 size={14} className="animate-spin" />
          ) : state.kind === "paused" ? (
            <Pause size={14} />
          ) : allDone ? (
            <Check size={14} />
          ) : state.kind === "error" ? (
            <AlertTriangle size={14} />
          ) : (
            <Sparkles size={14} />
          )}
          {running
            ? `Generating ${state.kind === "running" || state.kind === "paused" ? `${state.done + 1}/${state.total}` : ""}`
            : allDone
              ? "All generated"
              : state.kind === "error"
                ? "Continue"
                : "Generate all categories"}
        </Button>
      </div>
      {running && state.kind !== "idle" && "total" in state && state.total > 0 && (
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-overlay">
          <div
            className="h-full rounded-full bg-accent transition-all"
            style={{ width: `${Math.round(((state.kind === "running" || state.kind === "paused" ? state.done : 0) / state.total) * 100)}%` }}
          />
        </div>
      )}
    </Card>
  );
}
