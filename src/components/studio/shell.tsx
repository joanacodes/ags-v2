"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useApi } from "./api";
import { paris, Sheet, ToastProvider } from "./ui";
import type { ReminderLine } from "@/studio/views/shared";

const NAV = [
  { href: "/studio/today", label: "Today", glyph: "☉" },
  { href: "/studio/map", label: "Map", glyph: "✦" },
  { href: "/studio/library", label: "Library", glyph: "□" },
  { href: "/studio/video", label: "Video", glyph: "▷" },
  { href: "/studio/settings", label: "Settings", glyph: "⚙" },
];

function Bell() {
  const { data } = useApi<{ due: ReminderLine[]; upcoming: ReminderLine[] }>("/api/studio/reminders", 60_000);
  const [open, setOpen] = useState(false);
  const due = data?.due ?? [];
  return (
    <>
      <button className="btn btn-quiet relative px-3" onClick={() => setOpen(true)} aria-label={`${due.length} reminders due`}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
          <path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15L6 16Z" />
          <path d="M10 20a2 2 0 0 0 4 0" />
        </svg>
        {due.length > 0 && <span className="absolute right-1 top-1 min-w-[18px] rounded-full bg-accent px-1 text-[10px] font-semibold leading-[18px] text-white">{due.length}</span>}
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Reminders">
        {due.length === 0 && <p className="text-sm text-ink-3">Nothing is due.</p>}
        <ul className="space-y-2">
          {due.map((r) => (
            <li key={r.id} className="panel p-3">
              <p className="text-sm font-medium">{r.title}</p>
              {r.body && <p className="mt-1 whitespace-pre-line text-sm text-ink-2">{r.body}</p>}
              <p className="mt-1 text-xs text-ink-3">{paris(r.dueAt)}</p>
            </li>
          ))}
        </ul>
        {(data?.upcoming.length ?? 0) > 0 && (
          <>
            <p className="eyebrow mt-6">Coming</p>
            <ul className="mt-2 space-y-1 text-sm">
              {data!.upcoming.slice(0, 12).map((r) => (
                <li key={r.id} className="flex justify-between gap-3">
                  <span className="truncate">{r.title}</span>
                  <span className="shrink-0 text-ink-3">{paris(r.dueAt, "day")}</span>
                </li>
              ))}
            </ul>
          </>
        )}
        <Link href="/studio/today#reminders" className="btn mt-6 w-full" onClick={() => setOpen(false)}>
          Open in Today
        </Link>
      </Sheet>
    </>
  );
}

export function Shell({ children, live, paused, signOut }: { children: React.ReactNode; live: boolean; paused: boolean; signOut: () => Promise<void> }) {
  const path = usePathname();
  return (
    <ToastProvider>
      <header className="sticky top-0 z-40 border-b border-line bg-paper/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4">
          <Link href="/studio/today" className="flex items-baseline gap-2 font-serif text-lg">
            <span className="h-2.5 w-2.5 self-center rounded-full bg-[radial-gradient(circle_at_35%_35%,#fff6df,#e9b26a_55%,#c76a35)] shadow-[0_0_10px_2px_rgba(255,214,150,.7)]" />
            The Studio
          </Link>
          <span className={`chip ${live ? "border-moss/40 text-moss" : "border-gold/50 text-[#8a5a12]"}`} title={live ? "STUDIO_LIVE is on: approved pieces are really posted" : "STUDIO_LIVE is off: every post is a dry run"}>
            {live ? "Live" : "Dry run"}
          </span>
          {paused && <span className="chip border-rust/40 text-rust">Paused</span>}
          <nav className="ml-4 hidden gap-1 md:flex">
            {NAV.map((n) => (
              <Link key={n.href} href={n.href} className={`rounded-full px-3 py-1.5 text-sm ${path.startsWith(n.href) ? "bg-ink text-paper" : "text-ink-2 hover:bg-ink/5"}`}>
                {n.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-1">
            <Bell />
            <form action={signOut} className="hidden md:block">
              <button className="btn btn-quiet btn-sm">Sign out</button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 pb-28 pt-6 md:pb-12">{children}</main>
      <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-line bg-paper/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
        {NAV.map((n) => (
          <Link key={n.href} href={n.href} className={`flex flex-col items-center gap-0.5 py-2 text-[11px] ${path.startsWith(n.href) ? "text-accent" : "text-ink-3"}`}>
            <span className="font-serif text-lg leading-none" aria-hidden="true">
              {n.glyph}
            </span>
            {n.label}
          </Link>
        ))}
      </nav>
    </ToastProvider>
  );
}
