"use client";

import { useEffect, useState } from "react";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { BookOpenText, FilePlus2, Settings2, Upload, LoaderCircle, Link2 } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/layout/page-header";
import { ProgressPanel } from "@/components/layout/progress-panel";
import { ChartWheel } from "@/components/chart/chart-wheel";
import {
  ChartInsights,
  DominantFactors,
  MajorThemes,
  PlacementCards,
} from "@/components/chart/overview-panels";
import { ReadingDomainGrid } from "@/components/chart/reading-domain-grid";
import { ChartFacts } from "@/components/readings/chart-facts";
import { EmptyState, ErrorState } from "@/components/common/states";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useCalculateChart, useChart, useDeleteChart, useSetChartStatus } from "@/hooks/use-charts";
import { readingKeys } from "@/hooks/use-readings";
import { useQueryClient } from "@tanstack/react-query";
import { ReadingService } from "@/services/reading-service";
import { getReadingLanguage } from "@/lib/reading-prefs";
import { PRIMARY_CHART_ID } from "@/lib/navigation";
import { useReadingProgress, useReadings } from "@/hooks/use-readings";
import { formatBirthMoment } from "@/lib/format";

export default function ChartOverviewPage() {
  const params = useParams<{ chartId: string }>();
  const chartId = params.chartId;

  const { data: chart, isLoading, isError, refetch, error } = useChart(chartId);
  const router = useRouter();
  const calculate = useCalculateChart(chartId);
  const setStatus = useSetChartStatus(chartId);
  const deleteChart = useDeleteChart();
  const queryClient = useQueryClient();
  const { data: rprogress } = useReadingProgress(chartId);
  const [bulk, setBulk] = useState<{ done: number; total: number } | null>(null);
  const isDemo = chartId === PRIMARY_CHART_ID || chartId.startsWith("chart-clara") ||
    ["chart-julian-thorne","chart-saffron-hayes","chart-marcus-chen","chart-elena-rostova","chart-dorian-vance"].includes(chartId);

  const generateAllReadings = async () => {
    const list = await ReadingService.listReadings(chartId);
    const pending = list.filter((r) => r.status !== "complete").map((r) => r.slug);
    for (let i = 0; i < pending.length; i += 1) {
      setBulk({ done: i, total: pending.length });
      try {
        await ReadingService.regenerateReading(chartId, pending[i], "clinical", chart?.configuration.language ?? getReadingLanguage());
      } catch {
        break; // stop on first failure (missing key, etc.) — page stays usable
      }
    }
    setBulk(null);
    void queryClient.invalidateQueries({ queryKey: readingKeys.all });
  };

  // Auto-load every category once per chart, right after calculation.
  useEffect(() => {
    if (!chart || isDemo || bulk !== null) return;
    if (chart.planets.length === 0) return;
    if (rprogress === undefined || rprogress.completed > 0) return;
    const guard = `ags:autogen:${chartId}`;
    if (window.sessionStorage.getItem(guard) === "1") return;
    window.sessionStorage.setItem(guard, "1");
    void generateAllReadings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chart, rprogress, isDemo]);
  const isPending = chart !== undefined && chart.planets.length === 0;
  const { data: readings } = useReadings(chartId);
  const { data: progress } = useReadingProgress(chartId);

  const sidebarPanel =
    readings && progress ? (
      <ProgressPanel
        title="Reading Progress"
        items={[
          { label: "Birth Chart Overview", state: "complete" as const },
          ...readings.slice(0, 7).map((reading) => ({
            label: reading.shortTitle,
            state:
              reading.status === "complete"
                ? ("complete" as const)
                : reading.status === "in-progress"
                  ? ("active" as const)
                  : ("pending" as const),
          })),
        ]}
        overall={progress.overall}
      />
    ) : undefined;

  return (
    <AppShell sidebarPanel={sidebarPanel}>
      <PageHeader
        crumbs={[
          { label: "Birth Charts", href: "/charts" },
          {
            label: chart ? `${chart.person.firstName} ${chart.person.lastName}` : "…",
          },
        ]}
        title="Birth Chart Overview"
        actions={
          <>
            <Link
              href="/settings"
              className="inline-flex h-9 items-center gap-2 rounded-lg border border-line px-4 text-sm font-medium text-ink-secondary transition-colors hover:border-line-strong hover:text-ink"
            >
              <Settings2 size={13} />
              Settings
            </Link>
            {!isDemo && chart && (
              <>
                <Button
                  variant="ghost"
                  size="md"
                  onClick={() => setStatus.mutate(chart.status === "archived" ? "active" : "archived")}
                  disabled={setStatus.isPending}
                >
                  {chart.status === "archived" ? "Unarchive" : "Archive"}
                </Button>
                <Button
                  variant="ghost"
                  size="md"
                  className="text-danger hover:text-danger"
                  onClick={() => {
                    if (window.confirm("Delete this chart and all its readings? This cannot be undone.")) {
                      deleteChart.mutate(chartId, { onSuccess: () => router.push("/charts") });
                    }
                  }}
                  disabled={deleteChart.isPending}
                >
                  Delete
                </Button>
              </>
            )}
            <Link
              href={`/charts/${chartId}/temporal`}
              className="inline-flex h-9 items-center gap-2 rounded-lg border border-line px-4 text-sm font-medium text-ink-secondary transition-colors hover:border-line-strong hover:text-ink"
            >
              Temporal
            </Link>
            <Link
              href={`/charts/${chartId}/interpretation`}
              className="inline-flex h-9 items-center gap-2 rounded-lg border border-line bg-surface-overlay px-4 text-sm font-medium text-ink transition-colors hover:bg-line-strong"
            >
              <BookOpenText size={13} />
              Interpretation
            </Link>
            <Link
              href={`/charts/${chartId}/report`}
              className="inline-flex h-9 items-center gap-2 rounded-lg border border-line bg-surface-overlay px-4 text-sm font-medium text-ink transition-colors hover:bg-line-strong"
            >
              <FilePlus2 size={13} />
              Generate Report
            </Link>
            <Link
              href={`/charts/${chartId}/report`}
              className="inline-flex h-9 items-center gap-2 rounded-lg bg-accent px-4 text-sm font-medium text-accent-foreground transition-colors hover:bg-accent-hover"
            >
              <Upload size={13} />
              Export
            </Link>
            {!isDemo && (
              <Link
                href={`/charts/${chartId}/readings#share`}
                title="Create a readee link (password-protected)"
                className="inline-flex h-9 items-center gap-2 rounded-lg border border-line px-4 text-sm font-medium text-ink-secondary transition-colors hover:border-line-strong hover:text-accent-hover"
              >
                <Link2 size={13} />
                Share
              </Link>
            )}
          </>
        }
      />

      {bulk !== null && (
        <div className="mx-4 mt-3 rounded-lg border border-accent/30 bg-accent-soft px-4 py-2.5 text-xs text-ink-secondary sm:mx-6">
          Loading all reading categories… {bulk.done + 1}/{bulk.total}
        </div>
      )}
      <main className="flex-1 px-4 py-5 sm:px-6 sm:py-6">
        {isError && (
          <ErrorState
            title="Chart unavailable"
            description={
              error instanceof Error
                ? `${error.message}. It may have been removed, or the link is out of date.`
                : "This chart couldn't be loaded."
            }
            onRetry={() => refetch()}
          />
        )}

        {isLoading && (
          <div className="space-y-6">
            <Skeleton className="h-24 w-full max-w-xl" />
            <div className="grid gap-4 xl:grid-cols-[1fr_380px]">
              <Skeleton className="h-[560px]" />
              <div className="space-y-4">
                <Skeleton className="h-40" />
                <Skeleton className="h-56" />
              </div>
            </div>
          </div>
        )}

        {chart && (
          <div className="space-y-8">
            {/* Person header */}
            <div className="flex items-center gap-4 border-b border-line pb-6">
              <Avatar
                firstName={chart.person.firstName}
                lastName={chart.person.lastName}
                size="lg"
              />
              <div>
                <h2 className="font-serif text-2xl font-semibold text-ink">
                  {chart.person.firstName} {chart.person.lastName}
                </h2>
                <p className="mt-0.5 text-sm text-ink-secondary">
                  {formatBirthMoment(chart.birth.date, chart.birth.time)} · {chart.birth.place}
                </p>
                <div className="mt-2.5 flex flex-wrap gap-2">
                  <Badge tone="accent">{chart.configuration.houseSystem} Houses</Badge>
                  <Badge>{chart.configuration.zodiac} Zodiac</Badge>
                  <Badge>{chart.configuration.ephemeris}</Badge>
                </div>
              </div>
            </div>

            {/* Wheel + right rail */}
            <div className="grid gap-4 xl:grid-cols-[1fr_380px]">
              <Card className="p-5">
                {chart.planets.length > 0 ? (
                  <ChartWheel chart={chart} />
                ) : (
                  <EmptyState
                    icon={LoaderCircle}
                    title={chart.status === "failed" ? "Calculation failed" : "Chart awaiting calculation"}
                    description={
                      calculate.isError
                        ? calculate.error instanceof Error
                          ? calculate.error.message
                          : "Calculation failed."
                        : "Run the ephemeris calculation to fill real placements, houses, and aspects."
                    }
                    className="h-full border-0 bg-transparent"
                    action={
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={() => calculate.mutate()}
                        disabled={calculate.isPending}
                      >
                        {calculate.isPending ? "Calculating…" : "Calculate now"}
                      </Button>
                    }
                  />
                )}
              </Card>
              <div className="space-y-4">
                {!isPending && <PlacementCards chart={chart} />}
                {!isPending && <DominantFactors chart={chart} />}
                <MajorThemes chart={chart} />
                <ChartInsights chart={chart} />
              </div>
            </div>

            {/* Reading domains */}


            {readings && readings.length > 0 && (
              <section aria-labelledby="chart-readings-heading">
                <div className="flex items-baseline justify-between gap-4">
                  <div>
                    <h2 id="chart-readings-heading" className="text-base font-semibold text-ink">
                      Chart Readings
                    </h2>
                    <p className="mt-0.5 text-xs text-ink-muted">
                      Select a domain to explore detailed interpretations
                    </p>
                  </div>
                  {progress && (
                    <span className="text-xs text-ink-muted">
                      {progress.completed} of {progress.total} completed
                    </span>
                  )}
                </div>
                <div className="mt-4">
                  <ReadingDomainGrid chartId={chartId} readings={readings} />
                </div>
              </section>
            )}
              {!isPending && (
                <section aria-labelledby="chart-data-heading">
                  <h2
                    id="chart-data-heading"
                    className="pb-4 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-faint"
                  >
                    Astrological Data
                  </h2>
                  <ChartFacts chart={chart} />
                </section>
              )}
          </div>
        )}
      </main>
    </AppShell>
  );
}
