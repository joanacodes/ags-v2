"use client";

import Link from "next/link";
import { useState } from "react";
import { useParams } from "next/navigation";
import { FilePlus2, Link2, Upload } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/layout/page-header";
import { ProgressPanel } from "@/components/layout/progress-panel";
import { ReadingCard } from "@/components/readings/reading-card";
import { ChartSummaryRail } from "@/components/readings/chart-summary-rail";
import { ShareCard } from "@/components/readings/share-card";
import { ShareDialog } from "@/components/readings/share-panel";
import { EmptyState, ErrorState } from "@/components/common/states";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { useChart } from "@/hooks/use-charts";
import { useReadingProgress, useReadings } from "@/hooks/use-readings";
import { GenerateAllCard } from "@/components/readings/generate-all-button";
import { formatDate } from "@/lib/format";
import { shortDegree } from "@/lib/astro";

export default function ReadingHubPage() {
  const params = useParams<{ chartId: string }>();
  const chartId = params.chartId;

  const { data: chart } = useChart(chartId);
  const [shareOpen, setShareOpen] = useState(false);
  const { data: readings, isLoading, isError, refetch } = useReadings(chartId);
  const { data: progress } = useReadingProgress(chartId);

  const sidebarPanel =
    readings && progress ? (
      <ProgressPanel
        title="Reading Progress"
        items={readings.slice(0, 8).map((reading) => ({
          label: reading.shortTitle,
          state:
            reading.status === "complete"
              ? ("complete" as const)
              : reading.status === "in-progress"
                ? ("active" as const)
                : ("pending" as const),
        }))}
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
            href: `/charts/${chartId}`,
          },
          { label: "Reading Hub", accent: true },
        ]}
        title="Reading Hub"
        actions={
          <>
          <>
            <Button variant="outline" size="md" onClick={() => setShareOpen(true)} disabled={!chart}>
              <Link2 size={13} />
              Share
            </Button>
            <Button variant="outline" size="md">
              <Upload size={13} />
              Export
            </Button>
            <Link
              href={`/charts/${chartId}/report`}
              className="inline-flex h-9 items-center gap-2 rounded-lg bg-accent px-4 text-sm font-medium text-white transition-colors hover:bg-accent-hover"
            >
              <FilePlus2 size={13} />
              Generate Report
            </Link>
          </>
          </>
        }
      />


      {/* Person strip */}
      {chart && (
        <div className="border-b border-line bg-surface/60 px-6 py-3">
          <div className="flex flex-wrap items-center gap-x-8 gap-y-2">
            <div className="flex items-center gap-3">
              <Avatar firstName={chart.person.firstName} lastName={chart.person.lastName} />
              <div>
                <p className="text-sm font-medium text-ink">
                  {chart.person.firstName} {chart.person.lastName}
                </p>
                <p className="text-[11px] text-ink-muted">
                  {formatDate(chart.birth.date)} · {chart.birth.place}
                </p>
              </div>
            </div>
            {progress && (
              <div className="flex min-w-[260px] flex-1 items-center gap-3">
                <span className="whitespace-nowrap text-xs text-ink-muted">Reading Progress</span>
                <Progress
                  value={(progress.completed / Math.max(progress.total, 1)) * 100}
                  className="max-w-xs"
                  aria-label="Reading progress"
                />
                <span className="whitespace-nowrap text-xs text-ink-secondary">
                  {progress.completed} / {progress.total} complete
                </span>
              </div>
            )}
            <p className="ml-auto hidden gap-3 text-xs text-ink-muted lg:flex">
              {chart.planets.length === 0 ? (
                <span>Awaiting calculation</span>
              ) : (
                <>
                  <span>☉ {shortDegree(chart.summary.sun)}</span>
                  <span>☽ {shortDegree(chart.summary.moon)}</span>
                  <span>ASC {shortDegree(chart.summary.ascendant)}</span>
                </>
              )}
            </p>
          </div>
        </div>
      )}

      <main className="flex-1 px-4 py-5 sm:px-6 sm:py-6">
        <div className="grid gap-8 xl:grid-cols-[1fr_240px]">
          <div>
            {chart && chart.planets.length > 0 && readings && (
              <GenerateAllCard
                chartId={chartId}
                language={chart.configuration.language}
                missing={readings.filter((r) => r.status !== "complete").length}
                total={readings.length}
                className="mb-6"
              />
            )}
            {isError && (
              <ErrorState
                description="The readings for this chart couldn't be loaded."
                onRetry={() => refetch()}
              />
            )}

            {isLoading && (
              <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
                {Array.from({ length: 6 }, (_, i) => (
                  <Skeleton key={i} className="h-64" />
                ))}
              </div>
            )}

            {!isLoading && !isError && readings?.length === 0 && (
              <EmptyState
                title="No readings yet"
                description="Readings are generated once the chart finishes processing. Check back shortly."
              />
            )}

            {readings && readings.length > 0 && (
              <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
                {readings.map((reading, index) => (
                  <ReadingCard
                    key={reading.id}
                    reading={reading}
                    chartId={chartId}
                    index={index}
                  />
                ))}
              </div>
            )}
          </div>

          <div className="hidden xl:block">
            {chart ? (
              <div className="space-y-4">
                <ShareCard
                  chartId={chartId}
                  birthDate={chart.birth.date}
                  personName={`${chart.person.firstName} ${chart.person.lastName}`}
                />
                <ChartSummaryRail chart={chart} progress={progress} />
              </div>
            ) : (
              <Skeleton className="h-96" />
            )}
          </div>
        </div>
      </main>
      {chart && (
        <ShareDialog
          open={shareOpen}
          onClose={() => setShareOpen(false)}
          chartId={chartId}
          birthDate={chart.birth.date}
          personName={`${chart.person.firstName} ${chart.person.lastName}`}
        />
      )}
    </AppShell>
  );
}
