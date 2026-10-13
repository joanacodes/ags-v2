"use client";

import Link from "next/link";
import { FileOutput, HeartHandshake, LineChart, UserPlus } from "lucide-react";
import { Card } from "@/components/ui/card";

/** Entry point to synastry (two-person compatibility). */
export function UpsellCard() {
  return (
    <Card className="relative overflow-hidden border-accent/30 bg-gradient-to-br from-accent-soft/60 via-surface-raised to-surface-raised p-5">
      <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent text-white">
        <HeartHandshake size={16} />
      </span>
      <h2 className="mt-4 text-sm font-semibold text-ink">Synastry</h2>
      <p className="mt-1 text-xs leading-relaxed text-ink-secondary">
        Compare two charts: attraction, the emotional bond, friction, and what helps the relationship.
      </p>
      <Link
        href="/synastry"
        className="mt-4 inline-flex h-8 items-center gap-1.5 rounded-lg bg-accent px-3 text-xs font-medium text-accent-foreground transition-colors hover:bg-accent-hover"
      >
        Start a synastry
      </Link>
    </Card>
  );
}

const QUICK_ACTIONS = [
  {
    icon: UserPlus,
    title: "Add New Client",
    description: "Create a fresh birth record",
    href: "/charts/new",
  },
  {
    icon: LineChart,
    title: "Run Synastry Report",
    description: "Compare two charts",
    href: "/synastry",
  },
  {
    icon: FileOutput,
    title: "Export PDF Bundle",
    description: "All open reports",
    href: "/reports",
  },
];

export function QuickActions() {
  return (
    <Card className="p-5">
      <h2 className="text-sm font-semibold text-ink">Quick Actions</h2>
      <div className="mt-4 space-y-2.5">
        {QUICK_ACTIONS.map((action) => (
          <Link
            key={action.title}
            href={action.href}
            className="flex items-center gap-3 rounded-lg border border-line bg-surface p-3 transition-colors hover:border-line-strong hover:bg-surface-overlay"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent-soft text-accent-hover">
              <action.icon size={14} />
            </span>
            <span>
              <span className="block text-xs font-medium text-ink">{action.title}</span>
              <span className="block text-[11px] text-ink-muted">{action.description}</span>
            </span>
          </Link>
        ))}
      </div>
    </Card>
  );
}
