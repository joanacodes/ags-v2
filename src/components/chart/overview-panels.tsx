"use client";

import type { Chart } from "@/types";
import { ordinal } from "@/lib/format";
import { elementColor, formatDegree } from "@/lib/astro";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StarRating } from "@/components/ui/star-rating";
import { cn } from "@/lib/utils";

/** The four headline placement cards (Sun / Moon / Ascendant / Ruler). */
export function PlacementCards({ chart }: { chart: Chart }) {
  const { summary } = chart;
  const cards = [
    {
      label: "Sun",
      value: formatDegree(summary.sun),
      detail: `${ordinal(summary.sun.house)} House`,
      accent: false,
    },
    {
      label: "Moon",
      value: formatDegree(summary.moon),
      detail: `${ordinal(summary.moon.house)} House`,
      accent: false,
    },
    {
      label: "Ascendant",
      value: formatDegree(summary.ascendant),
      detail: "Rising Sign",
      accent: true,
    },
    {
      label: "Chart Ruler",
      value: summary.chartRuler.planet,
      detail: summary.chartRuler.position,
      accent: false,
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3">
      {cards.map((card) => (
        <Card
          key={card.label}
          className={cn("p-4", card.accent && "border-accent/40 bg-accent-soft/25")}
        >
          <p
            className={cn(
              "text-[10px] font-semibold uppercase tracking-[0.14em]",
              card.accent ? "text-accent-hover" : "text-ink-faint",
            )}
          >
            {card.label}
          </p>
          <p className="mt-1.5 text-base font-semibold text-ink">{card.value}</p>
          <p className="mt-0.5 text-xs text-ink-muted">{card.detail}</p>
        </Card>
      ))}
    </div>
  );
}

export function DominantFactors({ chart }: { chart: Chart }) {
  const { summary } = chart;
  return (
    <Card className="p-5">
      <h3 className="text-sm font-semibold text-ink">Dominant Factors</h3>
      <dl className="mt-4 space-y-3.5 text-xs">
        <MeterRow
          label="Element"
          value={summary.dominantElement}
          barClassName={elementColor(summary.dominantElement)}
          strength={3}
        />
        <MeterRow
          label="Modality"
          value={summary.dominantModality}
          barClassName="bg-accent"
          strength={2}
        />
        <div className="flex items-center justify-between gap-3">
          <dt className="text-ink-muted">Dominant Planets</dt>
          <dd className="flex flex-wrap justify-end gap-1.5">
            {summary.dominantPlanets.map((planet, index) => (
              <Badge key={planet} tone={index === 0 ? "accent" : "neutral"}>
                {planet}
              </Badge>
            ))}
          </dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt className="text-ink-muted">Strongest Houses</dt>
          <dd className="flex gap-1.5">
            {summary.strongestHouses.map((house) => (
              <Badge key={house}>{ordinal(house)}</Badge>
            ))}
          </dd>
        </div>
      </dl>
    </Card>
  );
}

function MeterRow({
  label,
  value,
  barClassName,
  strength,
}: {
  label: string;
  value: string;
  barClassName: string;
  strength: 1 | 2 | 3;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-ink-muted">{label}</dt>
      <dd className="flex items-center gap-2.5">
        <span className="flex items-center gap-1" aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className={cn(
                "h-1.5 rounded-full",
                i === 0 ? "w-6" : i === 1 ? "w-4" : "w-2.5",
                i < strength ? barClassName : "bg-surface-overlay",
              )}
            />
          ))}
        </span>
        <span className="font-medium text-ink">{value}</span>
      </dd>
    </div>
  );
}

export function MajorThemes({ chart }: { chart: Chart }) {
  if (chart.summary.majorThemes.length === 0) return null;
  return (
    <Card className="p-5">
      <h3 className="text-sm font-semibold text-ink">Major Themes</h3>
      <ul className="mt-3.5 space-y-2.5">
        {chart.summary.majorThemes.map((theme) => (
          <li key={theme} className="flex gap-2.5 text-xs leading-relaxed text-ink-secondary">
            <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-accent" aria-hidden="true" />
            {theme}
          </li>
        ))}
      </ul>
    </Card>
  );
}

export function ChartInsights({ chart }: { chart: Chart }) {
  if (chart.summary.insights.length === 0) return null;
  return (
    <Card className="p-5">
      <h3 className="text-sm font-semibold text-ink">Chart Insights</h3>
      <dl className="mt-3.5 space-y-2.5">
        {chart.summary.insights.map((insight) => (
          <div key={insight.label} className="flex items-center justify-between gap-3 text-xs">
            <dt className="text-ink-muted">{insight.label}</dt>
            <dd>
              <StarRating value={insight.score} />
            </dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}

