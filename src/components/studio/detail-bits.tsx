"use client";
import type { EventRow, MetricRow } from "@/studio/store/rows";
import type { MediaView } from "@/studio/views/detail";
import { paris } from "./ui";

/** Views by day as a small line, with the latest totals beside it. */
export function MetricsChart({ rows }: { rows: readonly MetricRow[] }) {
  if (!rows.length) return <p className="text-sm text-ink-3">No numbers yet: the metrics worker reads them each night.</p>;
  const last = rows[rows.length - 1]!;
  const views = rows.map((r) => r.views ?? 0);
  const max = Math.max(1, ...views);
  const w = 220;
  const h = 48;
  const pts = views.map((v, i) => `${(i / Math.max(1, views.length - 1)) * w},${h - (v / max) * (h - 6) - 3}`).join(" ");
  const cells = [
    ["Views", last.views],
    ["Likes", last.likes],
    ["Comments", last.comments],
    ["Shares", last.shares],
    ["Saves", last.saves],
    ["Link taps", last.link_taps],
    ["Said TEST", last.keyword_comments],
  ] as const;
  return (
    <div className="flex flex-wrap items-center gap-4">
      {views.length > 1 ? (
        <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="img" aria-label="Views by day">
          <polyline points={pts} fill="none" stroke="#b5512c" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        </svg>
      ) : (
        <p className="w-[220px] text-xs text-ink-3">One night read so far; the line of views by day starts with the second.</p>
      )}
      <dl className="grid grid-cols-4 gap-x-4 gap-y-1 text-sm md:grid-cols-7">
        {cells.map(([k, v]) => (
          <div key={k}>
            <dt className="eyebrow">{k}</dt>
            <dd className="font-medium tabular-nums">{v ?? "—"}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export function MediaPreview({ media }: { media: readonly MediaView[] }) {
  const thumb = media.find((m) => m.kind === "thumbnail");
  const shown = media.filter((m) => m.kind === "video" || m.kind === "image");
  if (!shown.length) return null;
  return (
    <div className="flex gap-2 overflow-x-auto pb-1">
      {shown.map((m) => (
        <a key={m.id} href={`/api/studio/media/${m.id}?download=1`} className="block w-36 shrink-0 overflow-hidden rounded-xl border border-line bg-ink/5" title="Download">
          {m.kind === "video" ? (
            <video src={`/api/studio/media/${m.id}`} poster={thumb ? `/api/studio/media/${thumb.id}` : undefined} className="aspect-[9/16] w-full object-cover" muted playsInline preload="metadata" controls />
          ) : (
            // Signed, short-lived Storage addresses: next/image would proxy and cache what must stay private.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={`/api/studio/media/${m.id}`} alt="" className="w-full object-cover" loading="lazy" />
          )}
        </a>
      ))}
    </div>
  );
}

export function History({ events }: { events: readonly EventRow[] }) {
  if (!events.length) return <p className="text-sm text-ink-3">No changes recorded.</p>;
  return (
    <ol className="space-y-1 text-sm">
      {events.map((e) => (
        <li key={e.id} className="flex flex-wrap gap-x-2">
          <span className="w-36 shrink-0 text-ink-3">{paris(e.at)}</span>
          <span className="font-medium">{e.actor}</span>
          <span className="text-ink-2">
            {e.from_status || e.to_status ? `${e.from_status ?? "—"} → ${e.to_status ?? "—"}` : ""}
            {e.note ? ` ${e.note.length > 220 ? `${e.note.slice(0, 220)}…` : e.note}` : ""}
          </span>
        </li>
      ))}
    </ol>
  );
}
