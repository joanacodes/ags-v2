"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import type { ChartFactorUsed, RelevantAspect } from "@/types";
import { cn } from "@/lib/utils";

/** Right rail on the reading page: Chart Factors Used + Relevant Aspects. */
export function FactorsRail({
  factors,
  aspects,
}: {
  factors: ChartFactorUsed[];
  aspects: RelevantAspect[];
}) {
  const [openId, setOpenId] = useState<string | null>(factors[0]?.id ?? null);

  return (
    <aside aria-label="Evidence used in this reading">
      <h2 className="pb-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
        Chart Factors Used
      </h2>
      <ul className="space-y-2">
        {factors.map((factor) => {
          const open = openId === factor.id;
          return (
            <li key={factor.id} className="rounded-lg border border-line bg-surface-raised">
              <button
                type="button"
                aria-expanded={open}
                onClick={() => setOpenId(open ? null : factor.id)}
                className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left"
              >
                <span className="w-6 text-center font-serif text-sm text-accent-hover" aria-hidden="true">
                  {factor.glyph}
                </span>
                <span className="flex-1 text-xs font-semibold text-ink">{factor.name}</span>
                <span className="text-[11px] text-ink-muted">{factor.position}</span>
                <ChevronDown
                  size={13}
                  className={cn(
                    "shrink-0 text-ink-faint transition-transform duration-200",
                    open && "rotate-180",
                  )}
                />
              </button>
              <AnimatePresence initial={false}>
                {open && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2, ease: "easeOut" }}
                    className="overflow-hidden"
                  >
                    <p className="border-t border-line px-3.5 py-3 text-xs leading-relaxed text-ink-muted">
                      {factor.explanation}
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>
            </li>
          );
        })}
      </ul>

      <h2 className="pb-3 pt-6 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
        Relevant Aspects
      </h2>
      <ul className="space-y-2">
        {aspects.map((aspect) => (
          <li
            key={aspect.id}
            className="flex items-center justify-between gap-3 rounded-lg border border-line bg-surface-raised px-3.5 py-2.5"
            title={aspect.label}
          >
            <span className="font-serif text-xs text-ink-secondary" aria-hidden="true">
              {aspect.glyphs}
            </span>
            <span className="sr-only">{aspect.label}</span>
            <span className="text-[11px] font-medium text-warning">{aspect.detail}</span>
          </li>
        ))}
      </ul>
    </aside>
  );
}
