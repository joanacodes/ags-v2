import { cn } from "@/lib/utils";

export interface ProgressProps {
  value: number;
  className?: string;
  barClassName?: string;
  "aria-label"?: string;
}

export function Progress({ value, className, barClassName, ...props }: ProgressProps) {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <div
      role="progressbar"
      aria-valuenow={Math.round(clamped)}
      aria-valuemin={0}
      aria-valuemax={100}
      className={cn("h-1 w-full overflow-hidden rounded-full bg-surface-overlay", className)}
      {...props}
    >
      <div
        className={cn("h-full rounded-full bg-accent transition-[width] duration-500", barClassName)}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}
