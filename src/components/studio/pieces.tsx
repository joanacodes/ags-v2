"use client";
import Link from "next/link";
import type { PieceLine } from "@/studio/views/shared";
import { paris, Status } from "./ui";

const LANG = { en: "EN", fr: "FR" } as const;

/** One piece as a line: when, where, what, its state; its page one tap away. */
export function PieceRow({ p, children, selectable, selected, onSelect, showDay }: { p: PieceLine; children?: React.ReactNode; selectable?: boolean; selected?: boolean; onSelect?: (v: boolean) => void; showDay?: boolean }) {
  return (
    <li className="panel flex flex-col gap-2 p-3 md:flex-row md:items-center">
      <div className="flex min-w-0 flex-1 items-start gap-3">
        {selectable && <input type="checkbox" className="mt-1 h-4 w-4 accent-[#b5512c]" checked={!!selected} onChange={(e) => onSelect?.(e.target.checked)} aria-label="Select" />}
        <div className="w-16 shrink-0 text-xs text-ink-3">
          <div className="font-medium text-ink">{paris(p.scheduledAt, "time")}</div>
          {showDay && <div>{paris(p.scheduledAt, "day")}</div>}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5 text-xs text-ink-3">
            <span className="font-medium text-ink-2">{p.platformLabel}</span>· {p.formatLabel} · {LANG[p.language]}
            <Status value={p.status} label={p.dryRun ? "posted (dry run)" : undefined} />
            {p.gateOk === false && <Status value="failed" label="gate" />}
            {p.byHand && <span className="chip">by hand</span>}
          </div>
          <Link href={`/studio/library/pieces/${p.id}`} className="mt-0.5 block truncate text-sm hover:underline">
            {p.headline || "(no text)"}
          </Link>
          {p.error && <p className="mt-1 text-xs text-rust">{p.error}</p>}
          {p.url && (
            <a href={p.url} target="_blank" rel="noreferrer" className="mt-1 inline-block text-xs text-accent hover:underline">
              Open the post ↗
            </a>
          )}
        </div>
      </div>
      {children && <div className="flex flex-wrap gap-2 md:justify-end">{children}</div>}
    </li>
  );
}
