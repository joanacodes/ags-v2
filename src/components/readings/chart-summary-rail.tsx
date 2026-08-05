"use client";

import type { Chart, ReadingProgressSummary } from "@/types";
import { elementColor, formatDegree } from "@/lib/astro";
import { ordinal } from "@/lib/format";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

/** Right-hand chart summary rail on the Reading Hub. */
export function ChartSummaryRail({
  chart,
  progress,
}: {
  chart: Chart;
  progress?: ReadingProgressSummary;
}) {
  const { summary } = chart;
  const railPlanets = chart.planets.filter((p) =>
    ["Mercury", "Venus", "Mars", "Jupiter", "Saturn"].includes(p.planet),
  );

  return (
    <aside className="space-y-0 text-sm" aria-label="Chart summary">
      <h2 className="pb-4 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
        Chart Summary
      </h2>

      {chart.planets.length === 0 ? (
        <p className="text-xs leading-relaxed text-ink-faint">
          This chart has not been calculated yet — placements appear once the
          ephemeris runs.
        </p>
      ) : (
        <>

      <RailEntry
        label="Sun"
        value={formatDegree(summary.sun)}
        detail={`${ordinal(summary.sun.house)} House`}
      />
      <RailEntry
        label="Moon"
        value={formatDegree(summary.moon)}
        detail={`${ordinal(summary.moon.house)} House`}
      />
      <RailEntry label="Ascendant" value={formatDegree(summary.ascendant)} detail="Rising Sign" />
      <RailEntry
        label="Chart Ruler"
        value={summary.chartRuler.planet}
        detail={summary.chartRuler.position}
      />

      <div className="border-t border-line py-4">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
          Dominant Element
        </p>
        <div className="mt-2 flex items-center gap-2.5">
          <span className="flex items-center gap-1" aria-hidden="true">
            <span className={cn("h-1.5 w-6 rounded-full", elementColor(summary.dominantElement))} />
            <span className="h-1.5 w-3.5 rounded-full bg-surface-overlay" />
          </span>
          <span className="font-medium text-ink">{summary.dominantElement}</span>
        </div>
      </div>

      <div className="border-t border-line py-4">
        <p className="pb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
          Planetary Positions
        </p>
        <dl className="space-y-1.5 text-xs">
          {railPlanets.map((planet) => (
            <div key={planet.planet} className="flex items-center justify-between">
              <dt className="text-ink-muted">{planet.planet}</dt>
              <dd className="text-ink-secondary">
                {planet.degree}° {planet.sign}
              </dd>
            </div>
          ))}
        </dl>
      </div>

      {progress && (
        <div className="rounded-card border border-accent/35 bg-accent-soft/25 p-4">
          <p className="text-xs font-medium text-accent-hover">Overall Progress</p>
          <Progress value={progress.overall} className="mt-2.5" aria-label="Overall progress" />
          <p className="mt-2 text-[11px] text-ink-muted">
            {progress.completed} of {progress.total} sections read
          </p>
        </div>
      )}
      </>
      )}
    </aside>
  );
}

function RailEntry({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="border-t border-line py-4 first-of-type:border-t-0">
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-faint">{label}</p>
      <p className="mt-1 text-base font-semibold text-ink">{value}</p>
      <p className="mt-0.5 text-xs text-ink-muted">{detail}</p>
    </div>
  );
}
