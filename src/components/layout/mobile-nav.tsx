"use client";

/**
 * Bottom tab bar for phones and small tablets (the sidebar is desktop-only).
 * Mirrors the sidebar's navigation items; hidden on lg screens and in print.
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_ITEMS } from "@/lib/navigation";
import { cn } from "@/lib/utils";

export function MobileNav() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface-raised/95 backdrop-blur lg:hidden print:hidden"
    >
      <ul className="mx-auto flex max-w-md items-stretch justify-around">
        {NAV_ITEMS.map((item) => {
          const active = item.match(pathname ?? "");
          const Icon = item.icon;
          return (
            <li key={item.href} className="min-w-0 flex-1">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-[56px] flex-col items-center justify-center gap-1 px-1 pb-[max(0.375rem,env(safe-area-inset-bottom))] pt-1.5 text-[10px] font-medium transition-colors",
                  active ? "text-accent-hover" : "text-ink-muted hover:text-ink-secondary",
                )}
              >
                <Icon size={18} aria-hidden="true" />
                <span className="truncate">{item.label === "Birth Charts" ? "Charts" : item.label === "New Chart" ? "New" : item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
