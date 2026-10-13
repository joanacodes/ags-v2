"use client";

import Link from "next/link";
import { Calendar, Clock3, Download, Link2, Loader2, MapPin, MessageSquareText, Star, Trash2 } from "lucide-react";
import { motion } from "framer-motion";
import { useQueryClient } from "@tanstack/react-query";
import type { Chart, ChartsReadingProgress } from "@/types";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Avatar } from "@/components/ui/avatar";
import { MiniWheel } from "@/components/common/mini-wheel";
import { useDeleteChart } from "@/hooks/use-charts";
import { reportKeys, useExportReport } from "@/hooks/use-report";
import { ReportService } from "@/services/report-service";
import { SettingsService } from "@/services/settings-service";
import { notify } from "@/components/common/toaster";
import { StatusBadge } from "./status-badge";
import { ReadingsStatus } from "./readings-status";
import { ShareDialog } from "@/components/readings/share-panel";
import { useState } from "react";

export function ChartCard({
  chart,
  onToggleFavourite,
  commentCount = 0,
  readings,
  readingsTotal,
}: {
  chart: Chart;
  onToggleFavourite: (chartId: string) => void;
  commentCount?: number;
  /** Readings written and being written for this chart. */
  readings?: ChartsReadingProgress["charts"][string];
  /** Categories per chart (undefined while loading). */
  readingsTotal?: number;
}) {
  const deleteChart = useDeleteChart();
  const queryClient = useQueryClient();
  const exportReport = useExportReport();
  const [preparing, setPreparing] = useState(false);
  const downloading = preparing || exportReport.isPending;
  const [shareOpen, setShareOpen] = useState(false);
  const isDemo = chart.id.startsWith("chart-") && /^chart-[a-z]+-[a-z]+$/.test(chart.id);

  const archived = chart.status === "archived";

  /** The same PDF as the report page's export, without opening the chart. */
  async function downloadPdf() {
    setPreparing(true);
    try {
      const [report, settings] = await Promise.all([
        // Always fresh: readings may have been written since the last look.
        queryClient.fetchQuery({
          queryKey: reportKeys.detail(chart.id),
          queryFn: () => ReportService.getReport(chart.id),
          staleTime: 0,
        }),
        queryClient.fetchQuery({ queryKey: reportKeys.settings(), queryFn: SettingsService.getReportSettings }),
      ]);
      const hasReadings = report.sections.some(
        (section) => section.status !== "locked" && (section.paragraphs?.length ?? 0) > 0,
      );
      if (!hasReadings) {
        notify(`No readings for ${chart.person.firstName} yet: generate them first.`, "info");
        return;
      }
      exportReport.mutate({ chart, report, settings, format: "pdf" });
    } catch (error) {
      notify(error instanceof Error ? `Download failed: ${error.message}` : "Download failed.", "info");
    } finally {
      setPreparing(false);
    }
  }

  return (
    <motion.article
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className={cn(
        "group overflow-hidden rounded-card border border-line bg-surface-raised shadow-card transition-colors hover:border-line-strong",
        archived && "opacity-80",
      )}
    >
      {/* Wheel thumbnail */}
      <div className="relative h-36 border-b border-line bg-gradient-to-b from-accent-soft/20 to-surface">
        <Link
          href={`/charts/${chart.id}`}
          aria-label={`Open ${chart.person.firstName} ${chart.person.lastName}'s chart`}
          className="absolute inset-0"
        >
          <MiniWheel chart={chart} muted={archived} />
        </Link>
        <button
          type="button"
          onClick={() => onToggleFavourite(chart.id)}
          aria-label={chart.favourite ? "Remove from favourites" : "Add to favourites"}
          aria-pressed={chart.favourite}
          className="absolute right-3 top-3 rounded-md p-1 text-ink-faint transition-colors hover:text-warning"
        >
          <Star size={16} className={cn(chart.favourite && "fill-warning text-warning")} />
        </button>
        {archived && (
          <span className="absolute bottom-3 left-3 rounded bg-surface-overlay/90 px-2 py-0.5 text-[10px] text-ink-muted">
            Archived
          </span>
        )}
      </div>

      {/* Details */}
      <div className="p-4">
        <div className="flex items-center gap-3">
          <Avatar firstName={chart.person.firstName} lastName={chart.person.lastName} />
          <Link
            href={`/charts/${chart.id}`}
            className={cn(
              "text-sm font-semibold text-ink hover:text-accent-hover",
              archived && "text-ink-muted",
            )}
          >
            {chart.person.firstName} {chart.person.lastName}
          </Link>
        </div>
        <dl className="mt-3 space-y-1.5 text-xs text-ink-muted">
          <div className="flex items-center gap-2">
            <Calendar size={12} aria-hidden="true" />
            <dd>{formatDate(chart.birth.date)}</dd>
          </div>
          <div className="flex items-center gap-2">
            <MapPin size={12} aria-hidden="true" />
            <dd>{chart.birth.place}</dd>
          </div>
        </dl>
        <ReadingsStatus
          chart={chart}
          progress={readings}
          total={readingsTotal}
          canGenerate={!isDemo && chart.planets.length > 0}
          className="mt-3"
        />
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
          <span className="flex items-center gap-1.5 text-[11px] text-ink-muted">
            <Clock3 size={11} aria-hidden="true" />
            {chart.lastOpenedLabel === "Today" ? "Opened today" : chart.lastOpenedLabel}
          </span>
          {/* On narrow cards the buttons drop below the date, still on the right. */}
          <span className="ml-auto flex items-center gap-1.5">
            {commentCount > 0 && (
              <span
                title={`${commentCount} readee comment${commentCount > 1 ? "s" : ""}`}
                className="inline-flex items-center gap-1 rounded-full border border-line px-2 py-0.5 text-[10px] font-medium text-ink-muted"
              >
                <MessageSquareText size={10} className="text-accent-hover" />
                {commentCount}
              </span>
            )}
            <button
              type="button"
              aria-label={`Download ${chart.person.firstName}'s readings (PDF)`}
              title="Download PDF"
              disabled={downloading}
              onClick={() => void downloadPdf()}
              className="rounded-md border border-line p-1.5 text-ink-faint transition-colors hover:border-line-strong hover:text-accent-hover disabled:text-accent-hover"
            >
              {downloading ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
            </button>
            {!isDemo && (
              <>
                <button
                  type="button"
                  aria-label="Share with the readee"
                  title="Share with the readee"
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    setShareOpen(true);
                  }}
                  className="rounded-md border border-line p-1.5 text-ink-faint transition-colors hover:border-line-strong hover:text-accent-hover"
                >
                  <Link2 size={13} />
                </button>
                <button
                  type="button"
                  aria-label="Delete chart"
                  title="Delete chart"
                  disabled={deleteChart.isPending}
                  onClick={() => {
                    if (
                      window.confirm(
                        `Delete ${chart.person.firstName}'s chart and all its readings? This cannot be undone.`,
                      )
                    ) {
                      deleteChart.mutate(chart.id, {
                        onSuccess: () => notify("Chart deleted."),
                      });
                    }
                  }}
                  className="rounded-md border border-line p-1.5 text-ink-faint transition-colors hover:border-danger/50 hover:text-danger"
                >
                  <Trash2 size={13} />
                </button>
              </>
            )}
            <StatusBadge status={chart.status} />
          </span>
        </div>
      </div>
      {!isDemo && (
        <ShareDialog
          open={shareOpen}
          onClose={() => setShareOpen(false)}
          chartId={chart.id}
          birthDate={chart.birth.date}
          personName={`${chart.person.firstName} ${chart.person.lastName}`}
        />
      )}
    </motion.article>
  );
}
