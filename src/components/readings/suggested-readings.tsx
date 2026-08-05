"use client";

import Link from "next/link";
import type { Reading } from "@/types";
import { readingIcon } from "@/lib/reading-icons";
import { formatMinutes } from "@/lib/format";

export function SuggestedReadings({
  chartId,
  readings,
}: {
  chartId: string;
  readings: Reading[];
}) {
  if (readings.length === 0) return null;
  return (
    <section aria-labelledby="suggested-heading" className="border-t border-line pt-8">
      <h2 id="suggested-heading" className="text-sm font-semibold text-ink">
        Suggested Next Readings
      </h2>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        {readings.map((reading) => {
          const Icon = readingIcon(reading.icon);
          return (
            <Link
              key={reading.id}
              href={`/charts/${chartId}/readings/${reading.slug}`}
              className="group rounded-card border border-line bg-surface-raised p-4 transition-colors hover:border-accent/40 hover:bg-accent-soft/10"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-surface-overlay text-ink-muted transition-colors group-hover:bg-accent-soft group-hover:text-accent-hover">
                <Icon size={15} />
              </span>
              <p className="mt-6 text-sm font-medium text-ink">{reading.shortTitle}</p>
              <p className="mt-0.5 text-[11px] text-ink-muted">
                {formatMinutes(reading.estimatedMinutes)}
              </p>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
