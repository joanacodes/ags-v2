"use client";
import type { Health } from "@/studio/views/health";
import { ago, money, paris } from "./ui";

/** The strip above the Map and Today: live or dry, the two caps, the clock, the queue, the failures. */
export function HealthStrip({ h }: { h: Health }) {
  const pct = (a: number, b: number) => (b > 0 ? Math.min(100, Math.round((a / b) * 100)) : 0);
  const items: { label: string; value: string; tone?: "warn" | "bad" | "good" }[] = [
    { label: "Outbox", value: h.paused ? "paused" : h.live ? (h.ownerSet ? "live" : "live, but no owner id: dry") : "dry run", tone: h.paused ? "bad" : h.live && h.ownerSet ? "good" : "warn" },
    { label: "Mode", value: h.mode === "confirm" ? "confirm on Today" : "approve once" },
    { label: "Model spend", value: `${money(h.spend.spent)} / ${money(h.spend.cap)}`, tone: pct(h.spend.spent, h.spend.cap) >= 80 ? "warn" : undefined },
    { label: "Voice", value: `${h.voice.minutes.toFixed(1)} / ${h.voice.cap} min`, tone: pct(h.voice.minutes, h.voice.cap) >= 80 ? "warn" : undefined },
    { label: "Clock", value: h.lastTick ? `ticked ${ago(h.lastTick)}` : "no tick yet", tone: h.tickLate ? "bad" : undefined },
    { label: "Next run", value: h.next ? `${h.next.worker} · ${paris(h.next.at)}` : "—" },
    { label: "Queued", value: String(h.queued) },
    { label: "Failed (7 d)", value: String(h.failed), tone: h.failed ? "bad" : undefined },
  ];
  const tone = { warn: "text-[#8a5a12]", bad: "text-rust", good: "text-moss" };
  return (
    <div className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
      <dl className="flex min-w-max gap-5 rounded-2xl border border-line bg-card px-4 py-3 text-sm shadow-soft">
        {items.map((i) => (
          <div key={i.label}>
            <dt className="eyebrow">{i.label}</dt>
            <dd className={`mt-0.5 whitespace-nowrap font-medium ${i.tone ? tone[i.tone] : ""}`}>{i.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
