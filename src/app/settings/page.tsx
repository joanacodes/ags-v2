"use client";

import { Settings } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/common/states";

export default function SettingsPage() {
  return (
    <AppShell>
      <PageHeader title="Settings" crumbs={[{ label: "Workspace" }, { label: "Settings" }]} />
      <main className="flex-1 px-4 py-5 sm:px-6 sm:py-6">
        <EmptyState
          icon={Settings}
          title="Workspace settings are coming soon"
          description="House system defaults, ephemeris configuration, and export preferences will live here. For now, per-report settings are available on each report preview."
          className="mx-auto max-w-2xl"
        />
      </main>
    </AppShell>
  );
}
