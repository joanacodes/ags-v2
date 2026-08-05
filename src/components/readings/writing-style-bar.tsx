"use client";

import { RotateCcw } from "lucide-react";
import type { WritingStyle } from "@/types";
import { cn } from "@/lib/utils";

const STYLES: { id: WritingStyle; label: string }[] = [
  { id: "poetic", label: "Poetic" },
  { id: "clinical", label: "Clinical" },
  { id: "conversational", label: "Conversational" },
];

export function WritingStyleBar({
  value,
  onChange,
  onRegenerate,
  regenerating,
}: {
  value: WritingStyle;
  onChange: (style: WritingStyle) => void;
  onRegenerate: () => void;
  regenerating: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-line bg-surface-raised p-3.5 shadow-card">
      <div className="flex items-center gap-2.5">
        <span className="text-xs text-ink-muted">Writing style:</span>
        <div role="radiogroup" aria-label="Writing style" className="flex items-center gap-1.5">
          {STYLES.map((style) => (
            <button
              key={style.id}
              type="button"
              role="radio"
              aria-checked={value === style.id}
              onClick={() => onChange(style.id)}
              className={cn(
                "rounded-lg border px-3 py-1.5 text-xs transition-colors",
                value === style.id
                  ? "border-accent/50 bg-accent-soft text-accent-hover"
                  : "border-line text-ink-muted hover:border-line-strong hover:text-ink-secondary",
              )}
            >
              {style.label}
            </button>
          ))}
        </div>
      </div>
      <button
        type="button"
        onClick={onRegenerate}
        disabled={regenerating}
        className="flex items-center gap-2 rounded-lg border border-line px-3 py-1.5 text-xs text-ink-secondary transition-colors hover:border-line-strong hover:text-ink disabled:opacity-50"
      >
        <RotateCcw size={12} className={cn(regenerating && "animate-spin")} />
        {regenerating ? "Regenerating…" : "Regenerate"}
      </button>
    </div>
  );
}
