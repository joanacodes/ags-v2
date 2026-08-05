"use client";

import { Check } from "lucide-react";
import { WIZARD_STEPS } from "./schema";
import { cn } from "@/lib/utils";

export function WizardStepper({ currentStep }: { currentStep: number }) {
  return (
    <ol className="flex flex-wrap items-center gap-2" aria-label="Chart setup steps">
      {WIZARD_STEPS.map((step, index) => {
        const state =
          index < currentStep ? "complete" : index === currentStep ? "active" : "upcoming";
        return (
          <li key={step.id} className="flex items-center gap-2">
            {index > 0 && (
              <span
                aria-hidden="true"
                className={cn(
                  "h-px w-8 sm:w-12",
                  index <= currentStep ? "bg-accent/60" : "bg-line-strong",
                )}
              />
            )}
            <span className="flex items-center gap-2">
              <span
                aria-hidden="true"
                className={cn(
                  "flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-semibold",
                  state === "complete" && "bg-success text-surface-sunken",
                  state === "active" && "bg-accent text-white",
                  state === "upcoming" && "bg-surface-overlay text-ink-faint",
                )}
              >
                {state === "complete" ? <Check size={12} strokeWidth={3} /> : index + 1}
              </span>
              <span
                className={cn(
                  "text-xs font-medium",
                  state === "complete" && "text-success",
                  state === "active" && "text-accent-hover",
                  state === "upcoming" && "text-ink-faint",
                )}
              >
                {step.label}
              </span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}
