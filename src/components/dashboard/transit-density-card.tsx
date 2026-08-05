"use client";

import { useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import { motion } from "framer-motion";
import type { TransitDensityPoint } from "@/types";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

const MIN_YEAR = 1900;
const MAX_YEAR = 2050;

/** 24h transit density bar panel with the precession offset slider. */
export function TransitDensityCard({ data }: { data?: TransitDensityPoint[] }) {
  const [year, setYear] = useState(2026);

  return (
    <Card className="flex h-full flex-col p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold text-ink">Natal Chart Transit Density</h2>
          <p className="mt-0.5 text-xs text-ink-muted">Planetary transit density · 24h window</p>
        </div>
        <Button variant="outline" size="sm">
          <SlidersHorizontal size={13} />
          Configure
        </Button>
      </div>

      <div className="mt-5 flex flex-1 items-end gap-[3px]" aria-hidden="true">
        {data
          ? data.map((point) => (
              <motion.div
                key={point.hour}
                className="flex-1 rounded-t-sm bg-accent/35 hover:bg-accent/70"
                initial={{ height: 0 }}
                animate={{ height: `${Math.max(point.density, 4)}%` }}
                transition={{ duration: 0.45, delay: point.hour * 0.015, ease: "easeOut" }}
                title={`${String(point.hour).padStart(2, "0")}:00 · density ${point.density}`}
              />
            ))
          : Array.from({ length: 24 }, (_, i) => (
              <Skeleton key={i} className="h-16 flex-1 rounded-t-sm" />
            ))}
      </div>

      <div className="mt-6 flex items-center gap-4 text-xs text-ink-muted">
        <span className="whitespace-nowrap">
          Precession offset <span className="ml-1 text-ink-secondary">{MIN_YEAR}–{MAX_YEAR}</span>
        </span>
        <input
          type="range"
          min={MIN_YEAR}
          max={MAX_YEAR}
          value={year}
          onChange={(event) => setYear(Number(event.target.value))}
          aria-label="Precession offset year"
          className="h-1 flex-1 cursor-pointer appearance-none rounded-full bg-surface-overlay accent-[hsl(var(--accent))]"
        />
        <span className="w-10 text-right font-medium text-ink-secondary">{year}</span>
      </div>
    </Card>
  );
}
