import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

export function StarRating({
  value,
  max = 5,
  className,
  size = 14,
}: {
  value: number;
  max?: number;
  className?: string;
  size?: number;
}) {
  return (
    <div
      className={cn("flex items-center gap-0.5", className)}
      role="img"
      aria-label={`${value} of ${max} stars`}
    >
      {Array.from({ length: max }, (_, i) => (
        <Star
          key={i}
          size={size}
          className={i < value ? "fill-warning text-warning" : "text-ink-faint"}
        />
      ))}
    </div>
  );
}
