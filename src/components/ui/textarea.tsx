import { forwardRef } from "react";
import { cn } from "@/lib/utils";

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      "min-h-[80px] w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-faint",
      "transition-colors focus:border-accent/60 focus:outline-none focus:ring-1 focus:ring-accent/40",
      className,
    )}
    {...props}
  />
));
Textarea.displayName = "Textarea";
