"use client";

import { AlertTriangle, Inbox, RotateCcw, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Empty state: an invitation to act, not just an absence. */
export function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
  action,
  className,
}: {
  icon?: LucideIcon;
  title: string;
  description: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-card border border-dashed border-line-strong bg-surface-raised/50 px-8 py-14 text-center",
        className,
      )}
    >
      <span className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-surface-overlay text-ink-muted">
        <Icon size={18} />
      </span>
      <h3 className="text-sm font-semibold text-ink">{title}</h3>
      <p className="mt-1 max-w-sm text-xs leading-relaxed text-ink-muted">{description}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

/** Error state: says what failed and offers the fix. */
export function ErrorState({
  title = "Couldn't load this data",
  description,
  onRetry,
  className,
}: {
  title?: string;
  description: string;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={cn(
        "flex flex-col items-center justify-center rounded-card border border-danger/25 bg-danger-soft/40 px-8 py-12 text-center",
        className,
      )}
    >
      <span className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-danger-soft text-danger">
        <AlertTriangle size={18} />
      </span>
      <h3 className="text-sm font-semibold text-ink">{title}</h3>
      <p className="mt-1 max-w-sm text-xs leading-relaxed text-ink-muted">{description}</p>
      {onRetry && (
        <Button variant="outline" size="sm" className="mt-5" onClick={onRetry}>
          <RotateCcw size={13} />
          Try again
        </Button>
      )}
    </div>
  );
}
