"use client";

import Link from "next/link";
import { Clock3 } from "lucide-react";
import { motion } from "framer-motion";
import type { Reading } from "@/types";
import { readingIcon } from "@/lib/reading-icons";
import { formatMinutes, formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Badge, StatusDot } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";

/** Reading Hub card — generated from data, never hardcoded. */
export function ReadingCard({
  reading,
  chartId,
  index,
}: {
  reading: Reading;
  chartId: string;
  index: number;
}) {
  const Icon = readingIcon(reading.icon);
  const href = `/charts/${chartId}/readings/${reading.slug}`;
  const status = reading.status;

  return (
    <motion.article
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: Math.min(index * 0.04, 0.35), ease: "easeOut" }}
      className={cn(
        "flex flex-col rounded-card border bg-surface-raised p-5 shadow-card transition-colors",
        status === "complete" && "border-accent/35 hover:border-accent/60",
        status === "in-progress" && "border-warning/45 hover:border-warning/70",
        status === "not-started" && "border-line hover:border-line-strong",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <span
          className={cn(
            "flex h-10 w-10 items-center justify-center rounded-xl",
            status === "complete" && "bg-accent-soft text-accent-hover",
            status === "in-progress" && "bg-warning-soft text-warning",
            status === "not-started" && "bg-surface-overlay text-ink-muted",
          )}
        >
          <Icon size={17} />
        </span>
        {status === "complete" && (
          <Badge tone="success">
            <StatusDot /> Complete
          </Badge>
        )}
        {status === "in-progress" && (
          <Badge tone="warning">
            <StatusDot /> In Progress
          </Badge>
        )}
      </div>

      <h3 className="mt-4 text-sm font-semibold text-ink">{reading.title}</h3>
      <p className="mt-1.5 line-clamp-4 flex-1 text-xs leading-relaxed text-ink-muted">
        {reading.description}
      </p>

      {status === "in-progress" && (
        <div className="mt-3">
          <div className="mb-1 flex items-center justify-between text-[11px]">
            <span className="text-ink-muted">Reading progress</span>
            <span className="font-medium text-warning">{formatPercent(reading.progress)}</span>
          </div>
          <Progress value={reading.progress} barClassName="bg-warning" />
        </div>
      )}

      <div className="mt-4 flex items-center justify-between border-t border-line pt-3.5">
        <span className="flex items-center gap-1.5 text-[11px] text-ink-muted">
          <Clock3 size={11} aria-hidden="true" />
          {formatMinutes(reading.estimatedMinutes)}
        </span>
        <Link
          href={href}
          className={cn(
            "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
            status === "complete" && "text-accent-hover hover:bg-accent-soft",
            status === "in-progress" &&
              "bg-warning-soft text-warning hover:bg-warning/20",
            status === "not-started" &&
              "border border-line-strong text-ink-secondary hover:border-ink-faint hover:text-ink",
          )}
        >
          {status === "complete" ? "Review" : status === "in-progress" ? "Continue" : "Start Reading"}
        </Link>
      </div>
    </motion.article>
  );
}
