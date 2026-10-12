"use client";

import { useEffect, useMemo, useState } from "react";
import { getDefaultStyle } from "@/lib/reading-prefs";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Clock3, Upload } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/layout/page-header";
import { ProgressPanel } from "@/components/layout/progress-panel";
import { EvidenceCard } from "@/components/readings/evidence-card";
import { ReadeeFeedback } from "@/components/readings/readee-feedback";
import { AstrologerNotes } from "@/components/readings/astrologer-notes";
import { WritingStyleBar } from "@/components/readings/writing-style-bar";
import { ReadingBody } from "@/components/readings/reading-body";
import { FactorsRail } from "@/components/readings/factors-rail";
import { SuggestedReadings } from "@/components/readings/suggested-readings";
import { ChartFacts } from "@/components/readings/chart-facts";
import { ErrorState } from "@/components/common/states";
import { Badge, StatusDot } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { readingIcon } from "@/lib/reading-icons";
import { formatMinutes, formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useChart } from "@/hooks/use-charts";
import {
  useReading,
  useReadingProgress,
  useReadings,
  useRegenerateReading,
} from "@/hooks/use-readings";
import type { WritingStyle } from "@/types";

type ViewMode = "reading" | "chart-facts";

export default function ReadingPage() {
  const params = useParams<{ chartId: string; slug: string }>();
  const router = useRouter();
  const { chartId, slug } = params;

  const { data: chart } = useChart(chartId);
  const { data: reading, isLoading, isError, refetch } = useReading(chartId, slug);
  const { data: readings } = useReadings(chartId);
  const { data: progress } = useReadingProgress(chartId);
  const regenerate = useRegenerateReading(chartId, slug);

  const [mode, setMode] = useState<ViewMode>("reading");
  const [style, setStyle] = useState<WritingStyle>("conversational");
  useEffect(() => setStyle(getDefaultStyle()), []);

  const { previous, next } = useMemo(() => {
    if (!readings) return { previous: undefined, next: undefined };
    const index = readings.findIndex((r) => r.slug === slug);
    return {
      previous: index > 0 ? readings[index - 1] : undefined,
      next: index >= 0 && index < readings.length - 1 ? readings[index + 1] : undefined,
    };
  }, [readings, slug]);

  const suggested = useMemo(() => {
    if (!reading || !readings) return [];
    return reading.suggestedNext
      .map((suggestedSlug) => readings.find((r) => r.slug === suggestedSlug))
      .filter((r): r is NonNullable<typeof r> => Boolean(r))
      .slice(0, 3);
  }, [reading, readings]);

  const sidebarPanel =
    readings && progress ? (
      <ProgressPanel
        title="Reading Progress"
        items={readings.slice(0, 8).map((r) => ({
          label: r.shortTitle,
          state:
            r.slug === slug && r.status !== "complete"
              ? ("active" as const)
              : r.status === "complete"
                ? ("complete" as const)
                : r.status === "in-progress"
                  ? ("active" as const)
                  : ("pending" as const),
        }))}
        overall={progress.overall}
      />
    ) : undefined;

  const Icon = reading ? readingIcon(reading.icon) : null;

  return (
    <AppShell sidebarPanel={sidebarPanel}>
      <PageHeader
        crumbs={
          reading
            ? [
                {
                  label: reading.breadcrumb[0] ?? "Chart",
                  href: `/charts/${chartId}`,
                },
                { label: "Birth Chart", href: `/charts/${chartId}` },
                ...reading.breadcrumb.slice(2, -1).map((label) => ({ label })),
                { label: "Reading", accent: true },
              ]
            : [{ label: "Reading" }]
        }
        title={reading?.title ?? "Reading"}
        actions={
          <>
            <div
              className="flex overflow-hidden rounded-lg border border-line"
              role="group"
              aria-label="View mode"
            >
              <button
                type="button"
                aria-pressed={mode === "reading"}
                onClick={() => setMode("reading")}
                className={cn(
                  "px-3.5 py-2 text-xs font-medium transition-colors",
                  mode === "reading"
                    ? "bg-accent text-white"
                    : "text-ink-muted hover:text-ink-secondary",
                )}
              >
                Reading
              </button>
              <button
                type="button"
                aria-pressed={mode === "chart-facts"}
                onClick={() => setMode("chart-facts")}
                className={cn(
                  "px-3.5 py-2 text-xs font-medium transition-colors",
                  mode === "chart-facts"
                    ? "bg-accent text-white"
                    : "text-ink-muted hover:text-ink-secondary",
                )}
              >
                Chart Facts
              </button>
            </div>
            <Button
              variant="outline"
              size="md"
              disabled={!previous}
              onClick={() =>
                previous && router.push(`/charts/${chartId}/readings/${previous.slug}`)
              }
            >
              <ChevronLeft size={13} />
              Prev
            </Button>
            <Button
              variant="outline"
              size="md"
              disabled={!next}
              onClick={() => next && router.push(`/charts/${chartId}/readings/${next.slug}`)}
            >
              Next
              <ChevronRight size={13} />
            </Button>
            <Button
              variant="primary"
              size="md"
              onClick={() => router.push(`/charts/${chartId}/report`)}
            >
              <Upload size={13} />
              Export
            </Button>
          </>
        }
      />

      <main className="flex-1 px-4 py-5 sm:px-6 sm:py-6">
        {isError && (
          <ErrorState
            title="Reading unavailable"
            description="This reading couldn't be loaded. It may still be generating, or the link is out of date."
            onRetry={() => refetch()}
          />
        )}

        {isLoading && (
          <div className="mx-auto max-w-2xl space-y-5">
            <Skeleton className="h-24" />
            <Skeleton className="h-52" />
            <Skeleton className="h-96" />
          </div>
        )}

        {reading && mode === "chart-facts" && (
          <div className="mx-auto max-w-5xl">
            {chart ? <ChartFacts chart={chart} /> : <Skeleton className="h-96" />}
          </div>
        )}

        {reading && mode === "reading" && (
          <div className="grid gap-10 xl:grid-cols-[minmax(0,1fr)_236px]">
            <article className="mx-auto w-full max-w-2xl">
              {/* Title block */}
              <div className="flex items-start gap-4">
                {Icon && (
                  <span className="mt-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-warning-soft text-warning">
                    <Icon size={18} />
                  </span>
                )}
                <div>
                  <div className="flex flex-wrap items-center gap-3">
                    {reading.status === "in-progress" && (
                      <Badge tone="warning">
                        <StatusDot /> In Progress · {formatPercent(reading.progress)}
                      </Badge>
                    )}
                    {reading.status === "complete" && <Badge tone="success">✓ Complete</Badge>}
                    {reading.status === "not-started" && <Badge>Not Started</Badge>}
                    <span className="flex items-center gap-1.5 text-xs text-ink-muted">
                      <Clock3 size={12} aria-hidden="true" />
                      {formatMinutes(reading.estimatedMinutes)} read
                    </span>
                  </div>
                  <h2 className="mt-2 font-serif text-3xl font-semibold text-ink">
                    {reading.title}
                  </h2>
                  <p className="mt-3 text-sm leading-relaxed text-ink-secondary">
                    {reading.description}
                  </p>
                </div>
              </div>

              {reading.sections.length > 0 && (
                <div className="mt-6">
                  <EvidenceCard reading={reading} />
                </div>
              )}

              <ReadeeFeedback chartId={chartId} slug={slug} />

              <AstrologerNotes chartId={chartId} slug={slug} />

              {/* Section progress */}
              {reading.sections.length > 0 && (
              <div className="mt-6">
                <div className="mb-1.5 flex items-center justify-between text-xs">
                  <span className="text-ink-muted">Section progress</span>
                  <span className="font-medium text-warning">
                    {formatPercent(reading.progress)} complete
                  </span>
                </div>
                <Progress value={reading.progress} barClassName="bg-warning" />
              </div>
              )}

              {reading.sections.length > 0 && (
              <div className="mt-6">
                <WritingStyleBar
                  value={style}
                  onChange={setStyle}
                  onRegenerate={() => regenerate.mutate(style)}
                  regenerating={regenerate.isPending}
                />
              </div>
              )}

              <div className="mt-10">
                {reading.sections.length > 0 ? (
                  <ReadingBody sections={reading.sections} />
                ) : (
                  <div className="rounded-card border border-dashed border-line-strong bg-surface-raised/60 px-8 py-14 text-center">
                    <h3 className="text-sm font-semibold text-ink">
                      This reading hasn&rsquo;t been generated yet
                    </h3>
                    <p className="mx-auto mt-2 max-w-md text-xs leading-relaxed text-ink-muted">
                      AGS will gather every relevant factor for {reading.title.toLowerCase()} —
                      placements, house cusps, aspects, retrogrades — compose the
                      grammar sentences, then write a full teaching-style reading
                      grounded in them.
                    </p>
                    {regenerate.isError && (
                      <p className="mx-auto mt-3 max-w-md rounded-lg border border-warning/30 bg-warning-soft px-3 py-2 text-xs text-ink-secondary">
                        {regenerate.error instanceof Error
                          ? regenerate.error.message
                          : "Generation failed."}
                      </p>
                    )}
                    <Button
                      variant="primary"
                      className="mt-5"
                      onClick={() => regenerate.mutate(style)}
                      disabled={regenerate.isPending}
                    >
                      {regenerate.isPending ? "Generating full reading…" : "Generate this reading"}
                    </Button>
                  </div>
                )}
              </div>

              <div className="mt-12">
                <SuggestedReadings chartId={chartId} readings={suggested} />
              </div>

              {/* Bottom pager */}
              <div className="mt-10 flex items-center justify-between border-t border-line pt-6">
                {previous ? (
                  <Link
                    href={`/charts/${chartId}/readings/${previous.slug}`}
                    className="flex items-center gap-2 text-xs text-ink-muted transition-colors hover:text-ink"
                  >
                    <ChevronLeft size={14} />
                    {previous.shortTitle}
                  </Link>
                ) : (
                  <span />
                )}
                {next && (
                  <Link
                    href={`/charts/${chartId}/readings/${next.slug}`}
                    className="flex items-center gap-2 text-xs text-ink-muted transition-colors hover:text-ink"
                  >
                    {next.shortTitle}
                    <ChevronRight size={14} />
                  </Link>
                )}
              </div>
            </article>

            <div className="hidden xl:block">
              <FactorsRail factors={reading.chartFactors} aspects={reading.relevantAspects} />
            </div>
          </div>
        )}
      </main>
    </AppShell>
  );
}
