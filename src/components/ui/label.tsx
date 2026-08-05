import { cn } from "@/lib/utils";

export interface LabelProps extends React.LabelHTMLAttributes<HTMLLabelElement> {
  required?: boolean;
  hint?: string;
}

export function Label({ className, children, required, hint, ...props }: LabelProps) {
  return (
    <label
      className={cn("mb-1.5 flex items-baseline gap-1 text-xs font-medium text-ink-secondary", className)}
      {...props}
    >
      {children}
      {required && <span className="text-danger">*</span>}
      {hint && <span className="font-normal text-ink-faint">{hint}</span>}
    </label>
  );
}
