"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Light/dark switch. Rendered as a compact icon button (default) or as a
 * full-width sidebar row (`variant="row"`). Guarded against hydration
 * mismatch: the resolved theme is only known on the client.
 */
export function ThemeToggle({
  variant = "icon",
  className,
}: {
  variant?: "icon" | "row";
  className?: string;
}) {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const isDark = resolvedTheme === "dark";
  const label = isDark ? "Switch to light mode" : "Switch to dark mode";
  const toggle = () => setTheme(isDark ? "light" : "dark");

  if (variant === "row") {
    return (
      <button
        type="button"
        onClick={toggle}
        aria-label={label}
        className={cn(
          "flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm text-ink-muted transition-colors hover:bg-surface-raised hover:text-ink-secondary",
          className,
        )}
      >
        <span className="flex items-center gap-3">
          {mounted && isDark ? <Moon size={16} /> : <Sun size={16} />}
          Appearance
        </span>
        <span className="text-xs text-ink-faint">
          {mounted ? (isDark ? "Dark" : "Light") : ""}
        </span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={label}
      className={cn(
        "inline-flex h-9 w-9 items-center justify-center rounded-lg border border-line text-ink-muted transition-colors hover:border-line-strong hover:text-ink",
        className,
      )}
    >
      {mounted && isDark ? <Moon size={15} /> : <Sun size={15} />}
    </button>
  );
}
