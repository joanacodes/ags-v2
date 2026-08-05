"use client";

import Link from "next/link";
import { Check } from "lucide-react";
import type { Reading } from "@/types";
import { readingIcon } from "@/lib/reading-icons";
import { cn } from "@/lib/utils";

const DOMAIN_SUBTITLES: Record<string, string> = {
  personality: "Core self & identity",
  family: "Roots & home life",
  career: "Vocation & ambition",
  "love-relationships": "Relationships",
  "friends-social": "Social networks",
  communication: "Mind & language",
  "money-resources": "Resources & value",
  "pain-healing": "Shadow & growth",
  talents: "Gifts & strengths",
  "purpose-growth": "Soul direction",
  summary: "Full synthesis",
};

const DOMAIN_SHORT_TITLES: Record<string, string> = {
  "love-relationships": "Love",
  "friends-social": "Friends",
  "money-resources": "Money",
  talents: "Talents",
};

/** Grid of reading domains on the chart overview — completion at a glance. */
export function ReadingDomainGrid({
  chartId,
  readings,
}: {
  chartId: string;
  readings: Reading[];
}) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
      {readings.map((reading) => {
        const Icon = readingIcon(reading.icon);
        const complete = reading.status === "complete";
        return (
          <Link
            key={reading.id}
            href={`/charts/${chartId}/readings/${reading.slug}`}
            className={cn(
              "group relative rounded-card border p-4 transition-colors",
              complete
                ? "border-accent/40 bg-accent-soft/20 hover:bg-accent-soft/35"
                : "border-line bg-surface-raised hover:border-line-strong",
            )}
          >
            {complete && (
              <span className="absolute right-3 top-3 flex h-4 w-4 items-center justify-center rounded-full bg-success text-surface-sunken">
                <Check size={10} strokeWidth={3} />
              </span>
            )}
            <span
              className={cn(
                "flex h-9 w-9 items-center justify-center rounded-lg",
                complete ? "bg-accent-soft text-accent-hover" : "bg-surface-overlay text-ink-muted",
              )}
            >
              <Icon size={16} />
            </span>
            <p className="mt-3 text-sm font-medium text-ink">
              {DOMAIN_SHORT_TITLES[reading.slug] ?? reading.shortTitle}
            </p>
            <p className="mt-0.5 text-[11px] text-ink-muted">
              {DOMAIN_SUBTITLES[reading.slug] ?? reading.shortTitle}
            </p>
          </Link>
        );
      })}
    </div>
  );
}
