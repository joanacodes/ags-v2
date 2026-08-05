import { cn } from "@/lib/utils";

type Tone = "neutral" | "accent" | "success" | "warning" | "muted";

const toneClasses: Record<Tone, string> = {
  neutral: "bg-surface-overlay text-ink-secondary border border-line",
  accent: "bg-accent-soft text-accent-hover border border-accent/30",
  success: "bg-success-soft text-success border border-success/25",
  warning: "bg-warning-soft text-warning border border-warning/25",
  muted: "bg-surface-overlay text-ink-muted border border-line",
};

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: Tone;
}

export function Badge({ className, tone = "neutral", ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-medium leading-5",
        toneClasses[tone],
        className,
      )}
      {...props}
    />
  );
}

export function StatusDot({ className }: { className?: string }) {
  return <span className={cn("h-1.5 w-1.5 rounded-full bg-current", className)} />;
}
