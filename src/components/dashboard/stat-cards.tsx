"use client";

import { BarChart3, BookOpenText, Clock3, Star, TrendingUp } from "lucide-react";
import type { ChartLibraryStats } from "@/types";
import { formatAgo } from "@/lib/format";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/** The dashboard's four numbers, from the person's own charts and readings. */
export function StatCards({ stats }: { stats?: ChartLibraryStats }) {
  if (!stats) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-36" />
        ))}
      </div>
    );
  }

  const cards = [
    {
      icon: BarChart3,
      value: String(stats.total),
      label: "Total Charts",
      footer:
        stats.addedThisWeek > 0 ? (
          <span className="flex items-center gap-1 text-success">
            <TrendingUp size={12} /> +{stats.addedThisWeek} this week
          </span>
        ) : (
          <span>None added this week</span>
        ),
    },
    {
      icon: BookOpenText,
      value: String(stats.readingsWritten),
      label: "Readings Written",
      footer: (
        <span>
          {stats.chartsComplete} chart{stats.chartsComplete === 1 ? "" : "s"} complete
        </span>
      ),
    },
    {
      icon: Star,
      value: String(stats.favourited),
      label: "Favorites",
      footer: <span>Starred profiles</span>,
    },
    {
      icon: Clock3,
      value: stats.lastReadingAt === null ? "—" : formatAgo(stats.lastReadingAt),
      label: "Last Reading",
      footer: <span>{stats.lastReadingAt === null ? "No readings yet" : "Latest one written"}</span>,
    },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map((card) => (
        <Card key={card.label} className="p-5">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent-soft text-accent-hover">
            <card.icon size={16} />
          </span>
          <p className="mt-4 text-2xl font-semibold tracking-tight text-ink">{card.value}</p>
          <p className="mt-0.5 text-xs text-ink-secondary">{card.label}</p>
          <p className="mt-2 text-[11px] text-ink-muted">{card.footer}</p>
        </Card>
      ))}
    </div>
  );
}
