"use client";

import { Sidebar } from "./sidebar";
import { MobileNav } from "@/components/layout/mobile-nav";

/**
 * Application frame: fixed sidebar with an optional contextual panel, and a
 * scrollable content column. Every screen renders inside this shell.
 */
export function AppShell({
  children,
  sidebarPanel,
}: {
  children: React.ReactNode;
  sidebarPanel?: React.ReactNode;
}) {
  return (
    <div className="min-h-screen">
      <Sidebar panel={sidebarPanel} />
      <div className="flex min-h-screen flex-col pb-16 lg:pb-0 lg:pl-60 print:pb-0 print:pl-0">{children}</div>
      <MobileNav />
    </div>
  );
}
