"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Send } from "lucide-react";
import { NAV_ITEMS } from "@/lib/navigation";
import { cn } from "@/lib/utils";
import { useWorkspaceUser } from "@/hooks/use-workspace";
import { Avatar } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { AuthStatus } from "@/components/auth/auth-status";

export function Sidebar({ panel }: { panel?: React.ReactNode }) {
  const pathname = usePathname();
  const { data: user } = useWorkspaceUser();

  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-line bg-surface lg:flex print:hidden">
      {/* Brand */}
      <Link
        href="/dashboard"
        className="flex items-center gap-3 px-5 pb-5 pt-5"
        aria-label="AGS home"
      >
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent text-white">
          <Send size={16} className="-rotate-12" />
        </span>
        <span>
          <span className="block text-sm font-semibold leading-tight text-ink">AGS</span>
          <span className="block text-[11px] leading-tight text-ink-muted">
            {user?.plan ?? "Pro Workspace"}
          </span>
        </span>
      </Link>

      {/* Navigation */}
      <nav aria-label="Primary" className="px-3">
        <p className="px-2 pb-2 pt-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
          Navigation
        </p>
        <ul className="space-y-0.5">
          {NAV_ITEMS.map((item) => {
            const active = item.match(pathname);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                    active
                      ? "bg-surface-overlay font-medium text-ink shadow-[inset_2px_0_0_hsl(var(--accent))]"
                      : "text-ink-muted hover:bg-surface-raised hover:text-ink-secondary",
                  )}
                >
                  <item.icon size={16} className={active ? "text-accent-hover" : undefined} />
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Contextual panel (progress, TOC, library stats…) */}
      {panel && <div className="mt-4 flex-1 overflow-y-auto px-3 pb-3">{panel}</div>}
      {!panel && <div className="flex-1" />}

      {/* User */}
      <div className="border-t border-line p-3">
        <AuthStatus />
        <ThemeToggle variant="row" className="mb-2" />
        {user ? (
          <div className="flex items-center gap-3 rounded-lg border border-line bg-surface-raised p-2.5">
            <Avatar firstName={user.name.split(" ")[0]} lastName={user.name.split(" ")[1] ?? ""} />
            <div className="min-w-0">
              <p className="truncate text-xs font-medium text-ink">{user.name}</p>
              <p className="truncate text-[11px] text-ink-muted">{user.email}</p>
            </div>
          </div>
        ) : (
          <Skeleton className="h-14 w-full" />
        )}
      </div>
    </aside>
  );
}
