"use client";

import { Send } from "lucide-react";
import type { Chart, Report } from "@/types";
import { formatBirthMoment } from "@/lib/format";
import { formatDegree } from "@/lib/astro";

/** Report cover page preview. */
export function ReportCover({ chart, report }: { chart: Chart; report: Report }) {
  const { summary } = chart;
  return (
    <section className="rounded-card border border-accent/30 bg-gradient-to-b from-accent-soft/35 to-surface-raised px-8 py-10 text-center shadow-card">
      <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-accent/90 text-white">
        <Send size={18} className="-rotate-12" />
      </span>
      <p className="mt-6 text-[11px] font-semibold uppercase tracking-[0.22em] text-accent-hover">
        AGS · Full Report
      </p>
      <h2 className="mt-2 font-serif text-3xl font-semibold text-ink">
        {chart.person.firstName} {chart.person.lastName}
      </h2>
      <p className="mt-2 text-sm text-ink-secondary">
        {formatBirthMoment(chart.birth.date, chart.birth.time)}
      </p>
      <p className="mt-0.5 text-xs text-ink-muted">
        {chart.birth.place} · {chart.configuration.houseSystem} Houses
      </p>

      <div className="mx-auto mt-8 grid max-w-md grid-cols-3 divide-x divide-line border-t border-line pt-6">
        <CoverStat label="Sun" value={formatDegree(summary.sun)} />
        <CoverStat label="Moon" value={formatDegree(summary.moon)} />
        <CoverStat label="Ascendant" value={formatDegree(summary.ascendant)} />
      </div>

      <p className="mt-8 text-[10px] text-ink-faint">{report.generator}</p>
    </section>
  );
}

function CoverStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-3">
      <p className="text-[11px] text-ink-muted">{label}</p>
      <p className="mt-1 text-sm font-semibold text-ink">{value}</p>
    </div>
  );
}
