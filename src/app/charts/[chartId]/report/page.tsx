"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Printer, Upload } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/layout/page-header";
import { ReportCover } from "@/components/report/report-cover";
import { ReportSectionView } from "@/components/report/report-section-view";
import { EditableSection } from "@/components/report/editable-section";
import { TechnicalAppendix } from "@/components/report/technical-appendix";
import { ExportRail } from "@/components/report/export-rail";
import { ErrorState } from "@/components/common/states";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { useChart } from "@/hooks/use-charts";
import {
  useExportReport,
  useReport,
  useReportSettings,
  useUpdateReportSettings,
} from "@/hooks/use-report";
import { formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ExportFormat } from "@/types";

export default function ReportPreviewPage() {
  const params = useParams<{ chartId: string }>();
  const chartId = params.chartId;

  const { data: chart } = useChart(chartId);
  const { data: report, isLoading, isError, refetch } = useReport(chartId);
  const { data: settings } = useReportSettings();
  const updateSettings = useUpdateReportSettings();
  const exportReport = useExportReport();
  const router = useRouter();
  const runExport = (format: ExportFormat) => {
    if (format === "link") {
      router.push(`/charts/${chartId}/readings#share`);
      return;
    }
    if (!chart || !report || !settings) return;
    exportReport.mutate({ chart, report, settings, format });
  };

  const [exported, setExported] = useState(false);
  useEffect(() => {
    if (!exportReport.isSuccess) return;
    setExported(true);
    const timer = setTimeout(() => setExported(false), 2500);
    return () => clearTimeout(timer);
  }, [exportReport.isSuccess]);

  const overall = report ? (report.sectionsReady / report.sectionsTotal) * 100 : 0;

  const tocPanel = report && (
    <section
      aria-label="Table of contents"
      className="rounded-card border border-line bg-surface-raised p-4"
    >
      <h2 className="pb-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
        Table of Contents
      </h2>
      <ul className="space-y-2 text-xs">
        <li className="flex items-center gap-2.5 font-medium text-accent-hover">
          <span aria-hidden="true">★</span> Cover &amp; Overview
        </li>
        {report.sections.map((section) => (
          <li
            key={section.id}
            className={cn(
              "flex items-center gap-2.5",
              section.status === "complete" && "text-ink-secondary",
              section.status === "in-progress" && "text-ink-secondary",
              section.status === "locked" && "text-ink-faint",
            )}
          >
            <span aria-hidden="true" className="w-3 text-center">
              {section.status === "complete" ? (
                <span className="text-success">✓</span>
              ) : (
                "○"
              )}
            </span>
            {section.title}
          </li>
        ))}
        <li className="flex items-center gap-2.5 text-ink-faint">
          <span aria-hidden="true" className="w-3 text-center">
            ▤
          </span>
          Appendix
        </li>
      </ul>
      <div className="mt-4 border-t border-line pt-3">
        <div className="mb-1.5 flex items-center justify-between text-xs">
          <span className="text-ink-muted">Overall Progress</span>
          <span className="font-medium text-warning">{formatPercent(overall)}</span>
        </div>
        <Progress value={overall} aria-label="Report readiness" />
        <p className="mt-2 text-[11px] text-ink-muted">
          {report.sectionsReady} of {report.sectionsTotal} sections ready
        </p>
      </div>
    </section>
  );

  return (
    <AppShell sidebarPanel={tocPanel}>
      <PageHeader
        crumbs={[
          {
            label: chart ? `${chart.person.firstName} ${chart.person.lastName}` : "…",
            href: `/charts/${chartId}`,
          },
          { label: "Birth Chart", href: `/charts/${chartId}` },
          { label: "Full Report Preview", accent: true },
        ]}
        title="Complete Birth Chart Report"
        actions={
          <>
            {report && (
              <span className="hidden text-xs text-ink-muted md:block">
                {report.sectionsReady}/{report.sectionsTotal} sections ready
              </span>
            )}
            <Button variant="outline" size="icon" aria-label="Print report" onClick={() => runExport("print")}>
              <Printer size={14} />
            </Button>
            <Button
              variant="primary"
              size="md"
              onClick={() => runExport("pdf")}
              disabled={exportReport.isPending || !report || !chart || !settings}
            >
              <Upload size={13} />
              Download PDF
            </Button>
          </>
        }
      />

      <main className="flex-1 px-4 py-5 sm:px-6 sm:py-6">
        {isError && (
          <ErrorState
            title="Report unavailable"
            description="The report preview couldn't be generated for this chart yet."
            onRetry={() => refetch()}
          />
        )}

        {isLoading && (
          <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_260px]">
            <div className="mx-auto w-full max-w-2xl space-y-6">
              <Skeleton className="h-80" />
              <Skeleton className="h-64" />
              <Skeleton className="h-64" />
            </div>
            <Skeleton className="h-[480px]" />
          </div>
        )}

        {report && chart && settings && (
          <div className="grid gap-10 xl:grid-cols-[minmax(0,1fr)_260px]">
            <div className="mx-auto w-full max-w-2xl space-y-10">
              <ReportCover chart={chart} report={report} />

              {/* -------- Contents (indexed) -------- */}
              <section className="print-keep rounded-card border border-line bg-surface-raised p-6">
                <h2 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
                  Contents
                </h2>
                <ol className="mt-3 space-y-1.5 text-sm">
                  <li>
                    <a
                      href="#glossary"
                      className="flex items-baseline justify-between gap-3 rounded text-ink-secondary transition-colors hover:text-accent-hover"
                    >
                      <span>Glossary</span>
                      <span className="text-xs text-ink-faint">§0</span>
                    </a>
                  </li>
                  {report.sections.map((section) => (
                    <li key={section.id}>
                      <a
                        href={`#${section.id}`}
                        className="flex items-baseline justify-between gap-3 rounded text-ink-secondary transition-colors hover:text-accent-hover"
                      >
                        <span>
                          {section.title}
                          {section.status === "locked" && (
                            <span className="pl-2 text-xs text-ink-faint">(not generated)</span>
                          )}
                        </span>
                        <span className="text-xs text-ink-faint">
                          §{String(section.index).padStart(2, "0")}
                        </span>
                      </a>
                    </li>
                  ))}
                  <li>
                    <a
                      href="#appendix"
                      className="flex items-baseline justify-between gap-3 rounded text-ink-secondary transition-colors hover:text-accent-hover"
                    >
                      <span>Technical Appendix</span>
                      <span className="text-xs text-ink-faint">§{report.sections.length + 1}</span>
                    </a>
                  </li>
                </ol>
                <p className="pt-3 text-[11px] text-ink-faint print:hidden">
                  Tip: enable “Headers and footers” in the print dialog to add page numbers.
                </p>
              </section>

              {/* -------- Glossary -------- */}
              {report.glossary.length > 0 && (
                <section id="glossary" className="print-page scroll-mt-6 rounded-card border border-line bg-surface-raised p-6">
                  <h2 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
                    §0 · Glossary — the terms this chart uses
                  </h2>
                  <dl className="mt-4 grid gap-x-8 gap-y-3 sm:grid-cols-2">
                    {report.glossary.map((entry) => (
                      <div key={entry.term}>
                        <dt className="text-xs font-semibold text-ink">{entry.term}</dt>
                        <dd className="pt-0.5 text-xs leading-relaxed text-ink-muted">
                          {entry.definition}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </section>
              )}

              {report.sections.map((section) =>
                section.status === "locked" ? (
                  <ReportSectionView key={section.id} section={section} chartId={chartId} />
                ) : (
                  <EditableSection key={section.id} section={section} chartId={chartId} />
                ),
              )}

              {settings.technicalAppendix && <TechnicalAppendix appendix={report.appendix} />}
            </div>

            <div className="print:hidden">
              <ExportRail
                report={report}
                settings={settings}
                onSettingsChange={(patch) => updateSettings.mutate(patch)}
                onExport={runExport}
                exporting={exportReport.isPending}
                exported={exported}
              />
            </div>
          </div>
        )}
      </main>
    </AppShell>
  );
}
