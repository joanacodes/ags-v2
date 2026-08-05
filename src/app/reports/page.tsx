"use client";

import Link from "next/link";
import { FileText } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/common/states";
import { useCharts } from "@/hooks/use-charts";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { PRIMARY_CHART_ID } from "@/lib/navigation";

export default function ReportsPage() {
  const { data: charts, isLoading } = useCharts();
  const reportable = charts?.filter((chart) => chart.id === PRIMARY_CHART_ID) ?? [];

  return (
    <AppShell>
      <PageHeader title="Reports" crumbs={[{ label: "Workspace" }, { label: "Reports" }]} />
      <main className="flex-1 px-4 py-5 sm:px-6 sm:py-6">
        {isLoading && (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 3 }, (_, i) => (
              <Skeleton key={i} className="h-36" />
            ))}
          </div>
        )}

        {!isLoading && reportable.length === 0 && (
          <EmptyState
            icon={FileText}
            title="No reports yet"
            description="Complete readings on a birth chart, then generate its full report from the chart overview."
          />
        )}

        {reportable.length > 0 && (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {reportable.map((chart) => (
              <Card key={chart.id} className="p-5">
                <div className="flex items-start justify-between">
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent-soft text-accent-hover">
                    <FileText size={15} />
                  </span>
                  <Badge tone="warning">Draft · 3/11</Badge>
                </div>
                <h2 className="mt-4 text-sm font-semibold text-ink">
                  {chart.person.firstName} {chart.person.lastName} — Full Report
                </h2>
                <p className="mt-1 text-xs text-ink-muted">
                  Complete birth chart report · A4 · PDF/A
                </p>
                <Link
                  href={`/charts/${chart.id}/report`}
                  className="mt-4 inline-flex h-8 items-center rounded-lg border border-line-strong px-3 text-xs font-medium text-ink-secondary transition-colors hover:border-ink-faint hover:text-ink"
                >
                  Open Preview
                </Link>
              </Card>
            ))}
          </div>
        )}
      </main>
    </AppShell>
  );
}
