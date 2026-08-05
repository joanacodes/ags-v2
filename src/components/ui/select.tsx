import { forwardRef } from "react";
import { cn } from "@/lib/utils";

export const Select = forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(({ className, children, ...props }, ref) => (
  <select
    ref={ref}
    className={cn(
      "h-10 w-full rounded-lg border border-line bg-surface px-3 pr-9 text-sm text-ink",
      "transition-colors focus:border-accent/60 focus:outline-none focus:ring-1 focus:ring-accent/40",
      className,
    )}
    {...props}
  >
    {children}
  </select>
));
Select.displayName = "Select";
