"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Archive, CircleDot, LayoutGrid, List, Plus, Search, SlidersHorizontal, Star, PieChart } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { ChartCard } from "@/components/library/chart-card";
import { EmptyState, ErrorState } from "@/components/common/states";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useCharts, useChartLibraryStats, useToggleFavourite } from "@/hooks/use-charts";
import { cn } from "@/lib/utils";

type LibraryFilter = "all" | "favourites" | "active" | "archived" | "recent";
type LibrarySort = "last-opened" | "name" | "created";

const FILTERS: { id: LibraryFilter; label: string }[] = [
  { id: "all", label: "All Charts" },
  { id: "favourites", label: "Favourites" },
  { id: "active", label: "Active" },
  { id: "archived", label: "Archived" },
  { id: "recent", label: "Recent (7d)" },
];

const RECENT_LABELS = ["Today", "Yesterday", "2 days ago", "4 days ago", "1 week ago"];

export default function BirthChartsPage() {
  const { data: charts, isLoading, isError, refetch } = useCharts();
  const { data: stats } = useChartLibraryStats();
  const toggleFavourite = useToggleFavourite();

  const [filter, setFilter] = useState<LibraryFilter>("all");
  const [query, setQuery] = useState("");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [sort, setSort] = useState<LibrarySort>("last-opened");

  const filtered = useMemo(() => {
    if (!charts) return [];
    const matches = charts.filter((chart) => {
      const name = `${chart.person.firstName} ${chart.person.lastName}`.toLowerCase();
      if (query && !name.includes(query.toLowerCase())) return false;
      switch (filter) {
        case "favourites":
          return chart.favourite;
        case "active":
          return chart.status === "active";
        case "archived":
          return chart.status === "archived";
        case "recent":
          return RECENT_LABELS.includes(chart.lastOpenedLabel);
        default:
          return true;
      }
    });
    return [...matches].sort((a, b) => {
      switch (sort) {
        case "name":
          return `${a.person.firstName} ${a.person.lastName}`.localeCompare(
            `${b.person.firstName} ${b.person.lastName}`,
          );
        case "created":
          return b.createdAt.localeCompare(a.createdAt);
        default:
          return b.lastOpenedAt.localeCompare(a.lastOpenedAt);
      }
    });
  }, [charts, filter, query, sort]);

  const libraryPanel = stats && (
    <section
      aria-label="Library overview"
      className="rounded-card border border-line bg-surface-raised p-4"
    >
      <h2 className="pb-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
        Library Overview
      </h2>
      <dl className="space-y-2.5 text-xs">
        <OverviewRow icon={<PieChart size={13} className="text-accent-hover" />} label="Total Charts" value={stats.total} />
        <OverviewRow icon={<Star size={13} className="text-warning" />} label="Favourited" value={stats.favourited} />
        <OverviewRow icon={<CircleDot size={13} className="text-success" />} label="Active" value={stats.active} />
        <OverviewRow icon={<Archive size={13} className="text-ink-muted" />} label="Archived" value={stats.archived} />
      </dl>
    </section>
  );

  return (
    <AppShell sidebarPanel={libraryPanel}>
      <header className="sticky top-0 z-20 border-b border-line bg-surface-sunken/90 backdrop-blur">
        <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-3">
          <div>
            <h1 className="text-lg font-semibold text-ink">Birth Charts</h1>
            <p className="text-xs text-ink-muted">
              {stats ? `${stats.total} charts · ${stats.favourited} favourited` : "Loading library…"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search
                size={14}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint"
              />
              <Input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search charts…"
                aria-label="Search charts"
                className="h-9 w-40 pl-9 sm:w-56"
              />
            </div>
            <Select
              aria-label="Sort charts"
              className="h-9 w-36"
              value={sort}
              onChange={(event) => setSort(event.target.value as LibrarySort)}
            >
              <option value="last-opened">Last Opened</option>
              <option value="name">Name</option>
              <option value="created">Date Created</option>
            </Select>
            <Button variant="outline" size="md">
              <SlidersHorizontal size={13} />
              Filters
            </Button>
            <div className="flex overflow-hidden rounded-lg border border-line" role="group" aria-label="View mode">
              <button
                type="button"
                aria-pressed={view === "grid"}
                aria-label="Grid view"
                onClick={() => setView("grid")}
                className={cn("p-2", view === "grid" ? "bg-surface-overlay text-accent-hover" : "text-ink-muted")}
              >
                <LayoutGrid size={14} />
              </button>
              <button
                type="button"
                aria-pressed={view === "list"}
                aria-label="List view"
                onClick={() => setView("list")}
                className={cn("p-2", view === "list" ? "bg-surface-overlay text-accent-hover" : "text-ink-muted")}
              >
                <List size={14} />
              </button>
            </div>
            <Link
              href="/charts/new"
              className="inline-flex h-9 items-center gap-2 rounded-lg bg-accent px-4 text-sm font-medium text-white transition-colors hover:bg-accent-hover"
            >
              <Plus size={14} />
              New Chart
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1 px-6 py-5">
        {/* Filter chips */}
        <div className="flex flex-wrap items-center gap-2 pb-5">
          <span className="text-xs text-ink-muted">Filter:</span>
          {FILTERS.map((option) => (
            <button
              key={option.id}
              type="button"
              aria-pressed={filter === option.id}
              onClick={() => setFilter(option.id)}
              className={cn(
                "rounded-full border px-3.5 py-1.5 text-xs transition-colors",
                filter === option.id
                  ? "border-accent/50 bg-accent-soft text-accent-hover"
                  : "border-line text-ink-muted hover:border-line-strong hover:text-ink-secondary",
              )}
            >
              {option.label}
            </button>
          ))}
        </div>

        {isError && (
          <ErrorState
            description="The chart library couldn't be loaded. Retry to fetch it again."
            onRetry={() => refetch()}
          />
        )}

        {isLoading && (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 8 }, (_, i) => (
              <Skeleton key={i} className="h-72" />
            ))}
          </div>
        )}

        {!isLoading && !isError && filtered.length === 0 && (
          <EmptyState
            icon={PieChart}
            title={query ? "No charts match your search" : "No charts in this view"}
            description={
              query
                ? `Nothing named "${query}" here. Clear the search or try another spelling.`
                : "Adjust the filter above, or create a new birth chart to get started."
            }
            action={
              <Link
                href="/charts/new"
                className="inline-flex h-9 items-center gap-2 rounded-lg bg-accent px-4 text-sm font-medium text-white transition-colors hover:bg-accent-hover"
              >
                <Plus size={14} />
                New Birth Chart
              </Link>
            }
          />
        )}

        {!isLoading && !isError && filtered.length > 0 && (
          <div
            className={cn(
              view === "grid"
                ? "grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4"
                : "mx-auto grid max-w-3xl gap-3",
            )}
          >
            {filtered.map((chart) => (
              <ChartCard
                key={chart.id}
                chart={chart}
                onToggleFavourite={(chartId) => toggleFavourite.mutate(chartId)}
              />
            ))}
          </div>
        )}
      </main>

      {/* Floating action */}
      <Link
        href="/charts/new"
        className="fixed bottom-6 right-6 z-30 inline-flex h-11 items-center gap-2 rounded-xl bg-accent px-5 text-sm font-medium text-white shadow-pop transition-colors hover:bg-accent-hover"
      >
        <Plus size={15} />
        New Birth Chart
      </Link>
    </AppShell>
  );
}

function OverviewRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <dt className="flex items-center gap-2 text-ink-muted">
        {icon}
        {label}
      </dt>
      <dd className="font-medium text-ink">{value}</dd>
    </div>
  );
}
