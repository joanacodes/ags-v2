"use client";

/**
 * Live notification bell: unread badge + dropdown of recent readee
 * activity (ratings and comments). "Read" state is the last time the
 * panel was opened, remembered per browser.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Bell, MessageSquareText, Star } from "lucide-react";

interface NotificationItem {
  id: string;
  chart_id: string;
  chartName: string;
  slug: string;
  rating: number | null;
  comment: string | null;
  author: string | null;
  created_at: string;
}

const SEEN_KEY = "ags:notifications:lastSeen";
const PANEL_WIDTH = 320;
/** Space kept between the panel and the screen edge. */
const GUTTER = 12;

/**
 * Where the panel goes, relative to the bell. Right-aligned to the bell
 * when there is room; otherwise slid back inside the screen. On a phone
 * the header actions wrap and the bell can sit mid-row, so a fixed
 * right-0 anchor pushed the panel off the left edge.
 */
function panelPlacement(anchor: DOMRect, viewportWidth: number): { left: number; width: number } {
  const width = Math.min(PANEL_WIDTH, viewportWidth - GUTTER * 2);
  const preferred = anchor.right - width;
  const left = Math.min(Math.max(preferred, GUTTER), viewportWidth - GUTTER - width);
  return { left: left - anchor.left, width };
}

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [lastSeen, setLastSeen] = useState<number>(0);
  const [placement, setPlacement] = useState<{ left: number; width: number } | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  const place = useCallback(() => {
    if (panelRef.current === null) return;
    setPlacement(
      panelPlacement(panelRef.current.getBoundingClientRect(), document.documentElement.clientWidth),
    );
  }, []);

  useEffect(() => {
    setLastSeen(Number(window.localStorage.getItem(SEEN_KEY) ?? 0));
  }, []);

  const { data } = useQuery({
    queryKey: ["notifications"],
    queryFn: async (): Promise<NotificationItem[]> => {
      const response = await fetch("/api/notifications");
      if (!response.ok) return [];
      const body = (await response.json()) as { items: NotificationItem[] };
      return body.items;
    },
    refetchInterval: 60_000,
  });

  const items = data ?? [];
  const unread = items.filter((item) => new Date(item.created_at).getTime() > lastSeen).length;

  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      if (panelRef.current !== null && !panelRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    window.addEventListener("pointerdown", close);
    // Rotating the phone or resizing the window moves the bell.
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("resize", place);
    };
  }, [open, place]);

  const openPanel = () => {
    const next = !open;
    if (next) place();
    setOpen(next);
    if (next) {
      const now = Date.now();
      window.localStorage.setItem(SEEN_KEY, String(now));
      setLastSeen(now);
    }
  };

  return (
    <div className="relative" ref={panelRef}>
      <button
        type="button"
        aria-label={unread > 0 ? `Notifications — ${unread} new` : "Notifications"}
        onClick={openPanel}
        className="relative flex h-9 w-9 items-center justify-center rounded-lg border border-line text-ink-muted transition-colors hover:border-line-strong hover:text-ink"
      >
        <Bell size={15} />
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[9px] font-semibold text-accent-foreground">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          className="absolute top-11 z-50 rounded-xl border border-line bg-surface-raised shadow-pop"
          style={placement ?? { right: 0, width: PANEL_WIDTH }}
        >
          <p className="border-b border-line px-4 py-2.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
            Readee activity
          </p>
          <div className="max-h-96 overflow-y-auto">
            {items.length === 0 && (
              <p className="px-4 py-6 text-center text-xs text-ink-muted">
                No activity yet — share a reading link to start receiving
                ratings and comments.
              </p>
            )}
            {items.map((item) => (
              <Link
                key={item.id}
                href={`/charts/${item.chart_id}/readings/${item.slug}`}
                onClick={() => setOpen(false)}
                className="block border-b border-line/60 px-4 py-3 transition-colors last:border-0 hover:bg-surface"
              >
                <p className="flex items-center gap-1.5 text-xs text-ink">
                  {item.comment !== null ? (
                    <MessageSquareText size={12} className="shrink-0 text-accent-hover" />
                  ) : (
                    <Star size={12} className="shrink-0 fill-warning text-warning" />
                  )}
                  <span className="min-w-0 truncate">
                    <span className="font-medium">{item.author ?? "The readee"}</span>
                    {item.comment !== null ? " commented on " : " rated "}
                    <span className="font-medium">{item.slug}</span>
                  </span>
                </p>
                <p className="pt-0.5 text-[11px] text-ink-faint">
                  {item.chartName} ·{" "}
                  {new Date(item.created_at).toLocaleString("en-GB", {
                    day: "2-digit",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
                {item.comment !== null && (
                  <p className="line-clamp-2 pt-1 text-xs leading-snug text-ink-secondary">
                    {item.comment}
                  </p>
                )}
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
