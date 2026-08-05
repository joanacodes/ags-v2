import { cn, initials } from "@/lib/utils";

/**
 * Deterministic gradient avatar from a person's name — no external image
 * dependency, stable per person.
 */
const GRADIENTS = [
  "from-indigo-500/80 to-violet-600/80",
  "from-sky-500/80 to-indigo-600/80",
  "from-violet-500/80 to-fuchsia-600/70",
  "from-emerald-500/70 to-teal-600/70",
  "from-amber-500/70 to-orange-600/70",
  "from-rose-500/70 to-pink-600/70",
];

function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash;
}

export function Avatar({
  firstName,
  lastName,
  className,
  size = "md",
}: {
  firstName: string;
  lastName: string;
  className?: string;
  size?: "sm" | "md" | "lg";
}) {
  const gradient = GRADIENTS[hashString(`${firstName} ${lastName}`) % GRADIENTS.length];
  const sizeClass =
    size === "sm" ? "h-7 w-7 text-[10px]" : size === "lg" ? "h-12 w-12 text-sm" : "h-9 w-9 text-xs";

  return (
    <div
      aria-hidden="true"
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br font-semibold text-white/90 ring-1 ring-white/10",
        gradient,
        sizeClass,
        className,
      )}
    >
      {initials(firstName, lastName)}
    </div>
  );
}
