"use client";

import Link from "next/link";
import { Calendar, Clock3, MapPin, Star } from "lucide-react";
import { motion } from "framer-motion";
import type { Chart } from "@/types";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Avatar } from "@/components/ui/avatar";
import { MiniWheel } from "@/components/common/mini-wheel";
import { StatusBadge } from "./status-badge";

export function ChartCard({
  chart,
  onToggleFavourite,
}: {
  chart: Chart;
  onToggleFavourite: (chartId: string) => void;
}) {
  const archived = chart.status === "archived";

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
        <div className="mt-4 flex items-center justify-between border-t border-line pt-3">
          <span className="flex items-center gap-1.5 text-[11px] text-ink-muted">
            <Clock3 size={11} aria-hidden="true" />
            {chart.lastOpenedLabel === "Today" ? "Opened today" : chart.lastOpenedLabel}
          </span>
          <StatusBadge status={chart.status} />
        </div>
      </div>
    </motion.article>
  );
}
