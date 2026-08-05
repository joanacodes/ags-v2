"use client";

import { BarChart3, Clock3, FileText, Star, TrendingUp } from "lucide-react";
import type { DashboardStats } from "@/types";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export function StatCards({ stats }: { stats?: DashboardStats }) {
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
      value: String(stats.totalCharts),
      label: "Total Charts",
      footer: (
        <span className="flex items-center gap-1 text-success">
          <TrendingUp size={12} /> {stats.totalChartsDelta}
        </span>
      ),
    },
    {
      icon: FileText,
      value: String(stats.recentReports),
      label: "Recent Reports",
      footer: <span>{stats.pendingExports} pending export</span>,
    },
    {
      icon: Star,
      value: String(stats.favourites),
      label: "Favorites",
      footer: <span>Starred profiles</span>,
    },
    {
      icon: Clock3,
      value: stats.lastReadingLabel,
      label: "Last Reading",
      footer: <span>Via Ephemeris Engine</span>,
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
