"use client";

import { CheckCircle2, CircleDot, Circle } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface ProgressPanelItem {
  label: string;
  state: "complete" | "active" | "pending";
}

/**
 * Sidebar contextual panel showing step / reading progress with an overall
 * completion bar — used by the reading screens and the chart wizard.
 */
export function ProgressPanel({
  title,
  items,
  overall,
  overallLabel = "Overall",
}: {
  title: string;
  items: ProgressPanelItem[];
  overall: number;
  overallLabel?: string;
}) {
  return (
    <section
      aria-label={title}
      className="rounded-card border border-line bg-surface-raised p-4"
    >
      <h2 className="pb-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
        {title}
      </h2>
      <ul className="space-y-2.5">
        {items.map((item) => (
          <li key={item.label} className="flex items-center gap-2.5 text-xs">
            {item.state === "complete" && (
              <CheckCircle2 size={14} className="shrink-0 text-success" />
            )}
            {item.state === "active" && (
              <CircleDot size={14} className="shrink-0 text-warning" />
            )}
            {item.state === "pending" && (
              <Circle size={14} className="shrink-0 text-ink-faint" />
            )}
            <span
              className={cn(
                item.state === "complete" && "text-ink-secondary",
                item.state === "active" && "font-medium text-ink",
                item.state === "pending" && "text-ink-faint",
              )}
            >
              {item.label}
            </span>
          </li>
        ))}
      </ul>
      <div className="mt-4 border-t border-line pt-3">
        <div className="mb-1.5 flex items-center justify-between text-xs">
          <span className="text-ink-muted">{overallLabel}</span>
          <span className="font-medium text-warning">{formatPercent(overall)}</span>
        </div>
        <Progress value={overall} aria-label={`${overallLabel} progress`} />
      </div>
    </section>
  );
}
