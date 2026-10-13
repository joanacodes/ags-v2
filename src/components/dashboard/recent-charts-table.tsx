"use client";

import Link from "next/link";
import { ExternalLink } from "lucide-react";
import type { Chart } from "@/types";
import { formatAgo, formatDate } from "@/lib/format";
import { Avatar } from "@/components/ui/avatar";
import { StarRating } from "@/components/ui/star-rating";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/library/status-badge";

const COLUMNS = ["Name", "Birth Date", "Birth Place", "Confidence", "Last Viewed", "Status", ""];

const SHOWN = 6;

/** The charts opened most recently. */
export function RecentChartsTable({ charts }: { charts?: Chart[] }) {
  const recent = charts
    ?.slice()
    .sort((a, b) => b.lastOpenedAt.localeCompare(a.lastOpenedAt))
    .slice(0, SHOWN);
  return (
    <div className="overflow-x-auto rounded-card border border-line bg-surface-raised shadow-card">
      <table className="w-full min-w-[760px] text-left text-sm">
        <thead>
          <tr className="border-b border-line text-[10px] uppercase tracking-[0.14em] text-ink-faint">
            {COLUMNS.map((column, index) => (
              <th key={index} className="px-5 py-3 font-semibold">
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {!charts &&
            Array.from({ length: 5 }, (_, i) => (
              <tr key={i} className="border-b border-line last:border-0">
                <td colSpan={7} className="px-5 py-3.5">
                  <Skeleton className="h-8 w-full" />
                </td>
              </tr>
            ))}
          {recent?.map((chart) => (
            <tr
              key={chart.id}
              className="border-b border-line transition-colors last:border-0 hover:bg-surface-overlay/40"
            >
              <td className="px-5 py-3.5">
                <div className="flex items-center gap-3">
                  <Avatar
                    firstName={chart.person.firstName}
                    lastName={chart.person.lastName}
                    size="sm"
                  />
                  <div>
                    <Link
                      href={`/charts/${chart.id}`}
                      className="text-sm font-medium text-ink hover:text-accent-hover"
                    >
                      {chart.person.firstName} {chart.person.lastName}
                    </Link>
                    <p className="text-[11px] text-ink-muted">
                      Sun <span aria-hidden="true">☉</span> {chart.summary.sun.sign}
                    </p>
                  </div>
                </div>
              </td>
              <td className="px-5 py-3.5 text-xs text-ink-secondary">
                {formatDate(chart.birth.date)}
              </td>
              <td className="px-5 py-3.5 text-xs text-ink-secondary">{chart.birth.place}</td>
              <td className="px-5 py-3.5">
                <div className="flex items-center gap-2">
                  <StarRating value={Math.round(chart.confidenceScore / 20)} size={12} />
                  <span className="text-xs text-ink-muted">{chart.confidenceScore}/100</span>
                </div>
              </td>
              <td className="px-5 py-3.5 text-xs text-ink-secondary">{formatAgo(chart.lastOpenedAt)}</td>
              <td className="px-5 py-3.5">
                <StatusBadge status={chart.status} />
              </td>
              <td className="px-5 py-3.5 text-right">
                <Link
                  href={`/charts/${chart.id}`}
                  aria-label={`Open ${chart.person.firstName} ${chart.person.lastName}`}
                  className="inline-flex text-ink-faint transition-colors hover:text-ink"
                >
                  <ExternalLink size={14} />
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
