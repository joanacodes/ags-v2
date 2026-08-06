"use client";

import Link from "next/link";
import { Plus, Search } from "lucide-react";
import { NotificationBell } from "@/components/common/notification-bell";
import { AppShell } from "@/components/layout/app-shell";
import { ProgressPanel } from "@/components/layout/progress-panel";
import { StatCards } from "@/components/dashboard/stat-cards";
import { LiveSky } from "@/components/dashboard/live-sky";
import { QuickActions, UpsellCard } from "@/components/dashboard/quick-panels";
import {
  EngineStatusBar,
  RecentChartsTable,
} from "@/components/dashboard/recent-charts-table";
import { ErrorState } from "@/components/common/states";
import { Input } from "@/components/ui/input";
import { Avatar } from "@/components/ui/avatar";
import { useCharts } from "@/hooks/use-charts";
import { useDashboardStats, useTransitDensity, useWorkspaceUser } from "@/hooks/use-workspace";
import { useReadings } from "@/hooks/use-readings";
import { PRIMARY_CHART_ID } from "@/lib/navigation";

export default function DashboardPage() {
  const { data: stats, isError, refetch } = useDashboardStats();
  const { data: density } = useTransitDensity();
  const { data: charts } = useCharts();
  const { data: user } = useWorkspaceUser();
  const { data: readings } = useReadings(PRIMARY_CHART_ID);

  const progressItems = readings
    ?.filter((r) =>
      ["personality", "love-relationships", "communication", "career", "purpose-growth", "summary"].includes(
        r.slug,
      ) || r.status !== "not-started",
    )
    .map((r) => ({
      label: r.shortTitle,
      state:
        r.status === "complete"
          ? ("complete" as const)
          : r.status === "in-progress"
            ? ("active" as const)
            : ("pending" as const),
    }));

  const overall = readings
    ? readings.reduce((sum, r) => sum + r.progress, 0) / Math.max(readings.length, 1)
    : 0;

  return (
    <AppShell
      sidebarPanel={
        progressItems && (
          <ProgressPanel title="Reading Progress" items={progressItems} overall={overall} />
        )
      }
    >
      {/* Header with workspace search */}
      <header className="sticky top-0 z-20 border-b border-line bg-surface-sunken/90 backdrop-blur">
        <div className="flex items-center justify-between gap-4 px-6 py-3">
          <h1 className="text-lg font-semibold text-ink">Dashboard</h1>
          <div className="flex items-center gap-3">
            <div className="relative hidden sm:block">
              <Search
                size={14}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint"
              />
              <Input
                type="search"
                placeholder="Search charts, clients…"
                aria-label="Search charts and clients"
                className="h-9 w-64 pl-9"
              />
            </div>
            <NotificationBell />
            {user && (
              <Avatar
                firstName={user.name.split(" ")[0]}
                lastName={user.name.split(" ")[1] ?? ""}
                size="sm"
              />
            )}
          </div>
        </div>
      </header>

      <main className="flex-1 space-y-6 px-6 py-6">
        {isError ? (
          <ErrorState
            description="The workspace stats service didn't respond. Check your connection and retry."
            onRetry={() => refetch()}
          />
        ) : (
          <>
            {stats && (
              <EngineStatusBar
                engineVersion={stats.engineVersion}
                syncLatency={stats.syncLatency}
                lastCalculationLabel={stats.lastCalculationLabel}
              />
            )}

            <StatCards stats={stats} />

            <div className="grid gap-4 xl:grid-cols-[1fr_320px]">
              <LiveSky />
              <div className="space-y-4">
                <UpsellCard />
                <QuickActions />
              </div>
            </div>

            <section aria-labelledby="recent-charts-heading" className="space-y-4">
              <div className="flex items-center justify-between gap-4">
                <h2 id="recent-charts-heading" className="text-base font-semibold text-ink">
                  Recent Charts
                </h2>
                <Link
                  href="/charts/new"
                  className="inline-flex h-9 items-center gap-2 rounded-full bg-accent px-4 text-sm font-medium text-white shadow-[0_4px_16px_hsl(var(--accent)/0.3)] transition-colors hover:bg-accent-hover"
                >
                  <Plus size={14} />
                  Create New Birth Chart
                </Link>
              </div>
              <RecentChartsTable charts={charts} />
            </section>
          </>
        )}
      </main>
    </AppShell>
  );
}
