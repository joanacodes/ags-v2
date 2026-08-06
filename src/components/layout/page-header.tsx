"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { NotificationBell } from "@/components/common/notification-bell";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/layout/theme-toggle";

export interface Crumb {
  label: string;
  href?: string;
  accent?: boolean;
}

/**
 * Sticky page header: breadcrumb trail on the first row, page title on the
 * second, actions pinned right — matching the pattern used across screens.
 */
export function PageHeader({
  crumbs,
  title,
  actions,
  className,
}: {
  crumbs?: Crumb[];
  title: string;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn(
        "sticky top-0 z-20 border-b border-line bg-surface-sunken/90 backdrop-blur print:hidden",
        className,
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3 sm:px-6">
        <div className="min-w-0">
          {crumbs && crumbs.length > 0 && (
            <nav aria-label="Breadcrumb" className="mb-0.5">
              <ol className="flex flex-wrap items-center gap-1 text-xs text-ink-muted">
                {crumbs.map((crumb, index) => (
                  <li key={`${crumb.label}-${index}`} className="flex items-center gap-1">
                    {index > 0 && <ChevronRight size={12} className="text-ink-faint" />}
                    {crumb.href ? (
                      <Link
                        href={crumb.href}
                        className={cn(
                          "transition-colors hover:text-ink-secondary",
                          crumb.accent && "text-accent-hover hover:text-accent-hover",
                        )}
                      >
                        {crumb.label}
                      </Link>
                    ) : (
                      <span className={cn(crumb.accent && "text-accent-hover")}>{crumb.label}</span>
                    )}
                  </li>
                ))}
              </ol>
            </nav>
          )}
          <h1 className="truncate text-lg font-semibold text-ink">{title}</h1>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <NotificationBell />
          <ThemeToggle className="lg:hidden" />
          {actions}
        </div>
      </div>
    </header>
  );
}
