"use client";

import Link from "next/link";
import { Lock, LockOpen } from "lucide-react";
import { motion } from "framer-motion";
import type { ReportSection } from "@/types";
import { readingIcon } from "@/lib/reading-icons";
import { Badge, StatusDot } from "@/components/ui/badge";
import { formatPercent } from "@/lib/format";

/**
 * A single report section. Complete and in-progress sections expand
 * automatically; locked sections render as placeholders that link back to
 * their reading.
 */
export function ReportSectionView({
  section,
  chartId,
}: {
  section: ReportSection;
  chartId: string;
}) {
  const Icon = readingIcon(section.icon);
  const indexLabel = `Section ${String(section.index).padStart(2, "0")}`;

  if (section.status === "locked") {
    return (
      <Link
        href={
          section.readingSlug
            ? `/charts/${chartId}/readings/${section.readingSlug}`
            : `/charts/${chartId}/readings`
        }
        className="flex items-center gap-4 rounded-card border border-line bg-surface-raised/50 p-4 opacity-55 transition-opacity hover:opacity-90"
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-overlay text-ink-faint">
          <Icon size={15} />
        </span>
        <span className="flex-1">
          <span className="block text-xs font-medium text-ink-secondary">
            {indexLabel} · {section.title}
          </span>
          <span className="block text-[11px] text-ink-muted">Complete the reading to unlock</span>
        </span>
        <Lock size={14} className="shrink-0 text-ink-faint" aria-hidden="true" />
      </Link>
    );
  }

  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-30px" }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      aria-labelledby={`report-${section.id}`}
      className="border-b border-line pb-10 print-page"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent-soft text-accent-hover">
            <Icon size={16} />
          </span>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-accent-hover">
              {indexLabel}
            </p>
            <h2 id={`report-${section.id}`} className="font-serif text-xl font-semibold text-ink">
              {section.title}
            </h2>
          </div>
        </div>
        {section.status === "complete" ? (
          <Badge tone="success">✓ Complete</Badge>
        ) : (
          <Badge tone="warning">
            <StatusDot /> In Progress
          </Badge>
        )}
      </div>

      <div className="mt-5 space-y-4">
        {section.paragraphs?.map((paragraph, index) =>
          paragraph.startsWith("## ") ? (
            <h4
              key={index}
              className="pt-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-muted"
            >
              {paragraph.slice(3)}
            </h4>
          ) : (
            <p key={index} className="text-sm leading-relaxed text-ink-secondary">
              {paragraph}
            </p>
          ),
        )}
      </div>

      {section.pullQuote && (
        <blockquote className="mt-5 border-l-2 border-accent bg-surface-raised px-5 py-4 font-serif text-sm italic leading-relaxed text-ink">
          &ldquo;{section.pullQuote}&rdquo;
        </blockquote>
      )}

      {section.status === "in-progress" && typeof section.progress === "number" && (
        <div className="mt-5 flex items-center gap-4 rounded-card border border-line bg-surface p-4">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-warning-soft text-warning">
            <LockOpen size={15} />
          </span>
          <div className="text-xs">
            <p className="font-medium text-ink">
              This section is in progress ({formatPercent(section.progress)} complete)
            </p>
            <p className="mt-0.5 text-ink-muted">
              Complete the reading to include the full section in the export
            </p>
          </div>
        </div>
      )}
    </motion.section>
  );
}
