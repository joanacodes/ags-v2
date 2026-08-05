"use client";

import { useState } from "react";
import { ChevronDown, HelpCircle, Sparkles } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import type { Reading } from "@/types";
import { Card } from "@/components/ui/card";
import { StarRating } from "@/components/ui/star-rating";
import { cn } from "@/lib/utils";

/**
 * Interpretation confidence card: chart factors, corroborating aspects and
 * the evidence score, with the expandable "Explain This Reading" panel.
 */
export function EvidenceCard({ reading }: { reading: Reading }) {
  const [explainOpen, setExplainOpen] = useState(false);
  const { confidence } = reading;

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-1.5">
          <h2 className="text-sm font-semibold text-ink">Interpretation Confidence</h2>
          <span
            className="text-ink-faint"
            title="How strongly the chart's factors support this interpretation."
          >
            <HelpCircle size={13} />
          </span>
        </div>
        <div className="flex items-center gap-2.5">
          <StarRating value={confidence.stars} />
          <span className="text-xs font-medium text-warning">{confidence.label}</span>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <EvidenceCell
          value={String(confidence.chartFactorsUsed)}
          label="Chart Factors"
          sublabel="used in reading"
        />
        <EvidenceCell
          value={String(confidence.aspectsCorroborating)}
          label="Aspects"
          sublabel="corroborating"
        />
        <EvidenceCell
          value={
            <>
              <span className="text-accent-hover">{confidence.evidenceScore}</span>
              <span className="text-sm font-normal text-ink-muted">/100</span>
            </>
          }
          label="Evidence Score"
          sublabel="strong support"
        />
      </div>

      <button
        type="button"
        onClick={() => setExplainOpen((open) => !open)}
        aria-expanded={explainOpen}
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg border border-accent/40 bg-accent-soft/30 py-2.5 text-xs font-medium text-accent-hover transition-colors hover:bg-accent-soft/60"
      >
        <Sparkles size={13} />
        Explain This Reading
        <ChevronDown
          size={13}
          className={cn("transition-transform duration-200", explainOpen && "rotate-180")}
        />
      </button>

      <AnimatePresence initial={false}>
        {explainOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className="overflow-hidden"
          >
            <div className="mt-4 space-y-3 rounded-lg border border-line bg-surface p-4">
              <p className="text-xs leading-relaxed text-ink-secondary">
                This reading is derived from {confidence.chartFactorsUsed} chart factors weighted
                by dignity, house placement, and orb precision. {confidence.aspectsCorroborating}{" "}
                independent aspects corroborate the primary interpretation, producing an evidence
                score of {confidence.evidenceScore}/100.
              </p>
              <ul className="space-y-2">
                {reading.chartFactors.slice(0, 3).map((factor) => (
                  <li key={factor.id} className="flex gap-2.5 text-xs text-ink-muted">
                    <span
                      className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-accent"
                      aria-hidden="true"
                    />
                    <span>
                      <span className="font-medium text-ink-secondary">{factor.name}</span> —{" "}
                      {factor.explanation}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  );
}

function EvidenceCell({
  value,
  label,
  sublabel,
}: {
  value: React.ReactNode;
  label: string;
  sublabel: string;
}) {
  return (
    <div className="rounded-lg border border-line bg-surface px-4 py-3.5 text-center">
      <p className="text-[11px] text-ink-muted">{label}</p>
      <p className="mt-1 text-2xl font-semibold tracking-tight text-ink">{value}</p>
      <p className="mt-0.5 text-[11px] text-ink-faint">{sublabel}</p>
    </div>
  );
}
