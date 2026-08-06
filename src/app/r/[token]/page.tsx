"use client";

/**
 * Public readee page (/r/:token): no account needed. A password unlocks the
 * shared readings; the readee rates each one (1-5 stars) and leaves notes
 * that the astrologer sees on the reading pages.
 */
import React, { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { Loader2, Lock, MessageSquarePlus, Moon, Send, Sparkles, Star, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { ChartWheel } from "@/components/chart/chart-wheel";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { renderInline } from "@/lib/rich-text";
import type { Chart, Reading } from "@/types";

interface SharedPayload {
  person: string;
  chart: Chart | null;
  readings: Reading[];
}

export default function SharedReadingPage() {
  const params = useParams<{ token: string }>();
  const token = params.token;
  const storageKey = `ags:share:${token}`;

  const [password, setPassword] = useState("");
  const [author, setAuthor] = useState("");
  const [unlocking, setUnlocking] = useState(false);
  const [gateError, setGateError] = useState<string | null>(null);
  const [payload, setPayload] = useState<SharedPayload | null>(null);

  const unlock = async (candidate: string) => {
    setUnlocking(true);
    setGateError(null);
    try {
      const response = await fetch(`/api/shared/${token}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password: candidate }),
      });
      const body = (await response.json()) as
        | SharedPayload
        | { error?: { message?: string } };
      if (!response.ok) {
        window.sessionStorage.removeItem(storageKey);
        setGateError(
          "error" in body ? body.error?.message ?? "Could not open the link." : "Could not open the link.",
        );
        return;
      }
      window.sessionStorage.setItem(storageKey, candidate);
      setPassword(candidate);
      setPayload(body as SharedPayload);
    } finally {
      setUnlocking(false);
    }
  };

  // Re-open silently if the password is already in this session.
  useEffect(() => {
    const stored = window.sessionStorage.getItem(storageKey);
    if (stored !== null) void unlock(stored);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  return (
    <div className="min-h-screen bg-surface-sunken pb-16">
      <header className="mx-auto flex max-w-3xl items-center gap-2.5 px-5 py-5">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-accent-foreground">
          <Sparkles size={14} />
        </span>
        <span className="text-sm font-semibold tracking-wide text-ink">AGS</span>
        <span className="text-xs text-ink-faint">· Shared reading</span>
        <span className="flex-1" />
        <ThemeButton />
      </header>

      <main className="mx-auto max-w-3xl px-5">
        {payload === null ? (
          <Card className="mx-auto mt-10 max-w-sm p-6">
            <div className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent-soft text-accent-hover">
                <Lock size={15} />
              </span>
              <div>
                <h1 className="text-sm font-semibold text-ink">This reading is protected</h1>
                <p className="text-xs text-ink-muted">Enter the password you were given.</p>
              </div>
            </div>
            <form
              className="pt-5"
              onSubmit={(event) => {
                event.preventDefault();
                void unlock(password);
              }}
            >
              <Label htmlFor="share-password">Password</Label>
              <Input
                id="share-password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoFocus
              />
              {gateError !== null && (
                <p className="pt-2 text-xs text-danger">{gateError}</p>
              )}
              <Button type="submit" variant="primary" className="mt-4 w-full" disabled={unlocking}>
                {unlocking ? <Loader2 size={13} className="animate-spin" /> : "Open the reading"}
              </Button>
            </form>
          </Card>
        ) : (
          <SafeBlock>
            {payload.chart !== null && (payload.chart.planets?.length ?? 0) > 0 && (
              <Card className="mt-2 overflow-hidden p-5">
                <div className="grid items-center gap-5 sm:grid-cols-[220px_1fr]">
                  <div className="mx-auto w-full max-w-[220px]">
                    <SafeBlock silent>
                      <ChartWheel chart={normalizeChart(payload.chart)} />
                    </SafeBlock>
                  </div>
                  <div>
                    <h1 className="font-serif text-2xl text-ink">{payload.person}</h1>
                    <p className="pt-1 text-xs text-ink-muted">
                      {formatBirthLine(payload.chart)}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2 text-xs">
                      {headerBadges(payload.chart).map((badge) => (
                        <span
                          key={badge}
                          className="rounded-full border border-line px-2.5 py-1 text-ink-secondary"
                        >
                          {badge}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </Card>
            )}

            <div className="pb-2 pt-4">
              {(payload.chart === null || payload.chart.planets.length === 0) && (
                <h1 className="font-serif text-2xl text-ink">{payload.person}</h1>
              )}
              <p className="pt-1 text-xs leading-relaxed text-ink-muted">
                These readings were prepared for you. After each one, tell the
                astrologer what rings true and what doesn&rsquo;t — your notes and
                ratings are sent to them directly.
              </p>
              <div className="mt-3 max-w-xs">
                <Label htmlFor="reader-name">Your name (optional)</Label>
                <Input
                  id="reader-name"
                  value={author}
                  onChange={(event) => setAuthor(event.target.value)}
                  placeholder="Shown next to your notes"
                />
              </div>
            </div>

            {payload.readings.length === 0 && (
              <Card className="mt-6 p-6 text-sm text-ink-muted">
                No readings have been generated for this chart yet.
              </Card>
            )}

            <div className="mt-4 space-y-4">
              {payload.readings.map((reading) => (
                <SharedReading
                  key={reading.slug}
                  reading={reading}
                  token={token}
                  password={password}
                  author={author}
                />
              ))}
            </div>
          </SafeBlock>
        )}
      </main>
    </div>
  );
}

function SharedReading({
  reading,
  token,
  password,
  author,
}: {
  reading: Reading;
  token: string;
  password: string;
  author: string;
}) {
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // --- Google-Doc-style anchored comments: select text -> comment bubble ---
  const contentRef = useRef<HTMLDivElement | null>(null);
  const [anchor, setAnchor] = useState<{ quote: string; x: number; y: number } | null>(null);
  const [bubbleOpen, setBubbleOpen] = useState(false);
  const [bubbleText, setBubbleText] = useState("");
  const [bubbleSending, setBubbleSending] = useState(false);
  const [anchoredSent, setAnchoredSent] = useState<{ quote: string; comment: string }[]>([]);

  const captureSelection = () => {
    const container = contentRef.current;
    const selection = window.getSelection();
    if (container === null || selection === null || selection.isCollapsed) {
      if (!bubbleOpen) setAnchor(null);
      return;
    }
    const text = selection.toString().trim();
    if (text.length < 2 || text.length > 500) return;
    const range = selection.getRangeAt(0);
    if (!container.contains(range.commonAncestorContainer)) return;
    const rect = range.getBoundingClientRect();
    const box = container.getBoundingClientRect();
    setAnchor({
      quote: text,
      x: Math.min(Math.max(rect.left - box.left + rect.width / 2, 60), box.width - 60),
      y: rect.top - box.top,
    });
    setBubbleOpen(false);
  };

  const sendAnchored = async () => {
    if (anchor === null || bubbleText.trim() === "") return;
    setBubbleSending(true);
    try {
      const response = await fetch(`/api/shared/${token}/feedback`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          password,
          slug: reading.slug,
          comment: bubbleText,
          quote: anchor.quote,
          author,
        }),
      });
      if (response.ok) {
        setAnchoredSent((current) => [...current, { quote: anchor.quote, comment: bubbleText }]);
        setBubbleText("");
        setBubbleOpen(false);
        setAnchor(null);
        window.getSelection()?.removeAllRanges();
      }
    } finally {
      setBubbleSending(false);
    }
  };

  const submit = async () => {
    setSending(true);
    setError(null);
    try {
      const response = await fetch(`/api/shared/${token}/feedback`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          password,
          slug: reading.slug,
          rating: rating > 0 ? rating : undefined,
          comment,
          author,
        }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as
          | { error?: { message?: string } }
          | null;
        setError(body?.error?.message ?? "Could not send your feedback.");
        return;
      }
      setSent(true);
    } finally {
      setSending(false);
    }
  };

  return (
    <details className="group rounded-card border border-line bg-surface-raised shadow-card">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4">
        <span className="text-sm font-semibold text-ink">{reading.title}</span>
        <span className="text-xs text-ink-faint transition-transform group-open:rotate-90">›</span>
      </summary>

      <div
        ref={contentRef}
        onPointerUp={captureSelection}
        className="relative border-t border-line px-5 py-4"
      >
        {anchor !== null && !bubbleOpen && (
          <button
            type="button"
            onClick={() => setBubbleOpen(true)}
            className="absolute z-20 flex -translate-x-1/2 -translate-y-full items-center gap-1.5 rounded-full border border-line bg-surface-raised px-3 py-1.5 text-xs font-medium text-ink-secondary shadow-pop transition-colors hover:text-accent-hover"
            style={{ left: anchor.x, top: Math.max(anchor.y - 6, 8) }}
          >
            <MessageSquarePlus size={13} />
            Comment
          </button>
        )}
        {anchor !== null && bubbleOpen && (
          <div
            className="absolute z-20 w-64 -translate-x-1/2 rounded-xl border border-line bg-surface-raised p-3 shadow-pop"
            style={{ left: anchor.x, top: Math.max(anchor.y + 14, 8) }}
          >
            <p className="max-h-16 overflow-hidden border-l-2 border-warning/60 bg-warning-soft/40 px-2 py-1 text-[11px] italic leading-snug text-ink-muted">
              “{anchor.quote.length > 120 ? `${anchor.quote.slice(0, 120)}…` : anchor.quote}”
            </p>
            <Textarea
              value={bubbleText}
              onChange={(event) => setBubbleText(event.target.value)}
              rows={2}
              placeholder="Your comment on this passage…"
              className="mt-2 text-xs"
              autoFocus
              aria-label="Comment on the selected passage"
            />
            <div className="mt-2 flex justify-end gap-2">
              <Button size="sm" variant="ghost" onClick={() => { setBubbleOpen(false); setAnchor(null); }}>
                Cancel
              </Button>
              <Button
                size="sm"
                variant="primary"
                disabled={bubbleSending || bubbleText.trim() === ""}
                onClick={() => void sendAnchored()}
              >
                {bubbleSending ? <Loader2 size={12} className="animate-spin" /> : "Send"}
              </Button>
            </div>
          </div>
        )}

        {(reading.sections ?? []).map((section, sectionIndex) => (
          <div key={section.id ?? sectionIndex} className="pb-4">
            <h3 className="pb-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-muted">
              {String(section.heading ?? "")}
            </h3>
            {(section.paragraphs ?? []).map((paragraph, index) => (
              <p key={index} className="pb-2.5 font-serif text-sm leading-relaxed text-ink-secondary">
                {renderInline(String(paragraph ?? ""))}
              </p>
            ))}
            {section.keyInsight !== undefined &&
              section.keyInsight !== null &&
              typeof section.keyInsight === "object" && (
                <p className="mb-2.5 rounded-lg border border-accent/25 bg-accent-soft px-3.5 py-2.5 text-xs leading-relaxed text-ink-secondary">
                  {typeof section.keyInsight.eyebrow === "string" && (
                    <span className="font-semibold">{section.keyInsight.eyebrow}: </span>
                  )}
                  {typeof section.keyInsight.body === "string" ? section.keyInsight.body : ""}
                </p>
              )}
          </div>
        ))}

        {anchoredSent.length > 0 && (
          <div className="mb-3 space-y-2">
            {anchoredSent.map((entry, index) => (
              <div key={index} className="rounded-lg border border-line bg-surface px-3 py-2">
                <p className="border-l-2 border-warning/60 bg-warning-soft/40 px-2 py-0.5 text-[11px] italic text-ink-muted">
                  “{entry.quote.length > 90 ? `${entry.quote.slice(0, 90)}…` : entry.quote}”
                </p>
                <p className="pt-1 text-xs text-ink-secondary">{entry.comment}</p>
                <p className="pt-0.5 text-[10px] text-success">Sent to the astrologer ✓</p>
              </div>
            ))}
          </div>
        )}

        {/* ------------------------- feedback ------------------------- */}
        <div className="rounded-lg border border-line bg-surface p-4">
          {sent ? (
            <p className="text-xs text-success">
              Thank you — your feedback on {reading.title} was sent to the astrologer.
            </p>
          ) : (
            <>
              <p className="text-xs font-semibold text-ink">How accurate does this feel?</p>
              <div className="flex gap-1 pt-2" role="radiogroup" aria-label="Rating">
                {[1, 2, 3, 4, 5].map((value) => (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={rating === value}
                    aria-label={`${value} star${value > 1 ? "s" : ""}`}
                    onClick={() => setRating(value === rating ? 0 : value)}
                    className="p-0.5"
                  >
                    <Star
                      size={20}
                      className={
                        value <= rating ? "fill-warning text-warning" : "text-ink-faint"
                      }
                    />
                  </button>
                ))}
              </div>
              <Textarea
                value={comment}
                onChange={(event) => setComment(event.target.value)}
                rows={3}
                placeholder="What rings true? What feels off? Any detail helps."
                className="mt-3"
                aria-label={`Notes on ${reading.title}`}
              />
              {error !== null && <p className="pt-2 text-xs text-danger">{error}</p>}
              <Button
                variant="primary"
                size="sm"
                className="mt-3"
                onClick={() => void submit()}
                disabled={sending || (rating === 0 && comment.trim() === "")}
              >
                {sending ? (
                  <Loader2 size={13} className="animate-spin" />
                ) : (
                  <>
                    <Send size={12} />
                    Send to the astrologer
                  </>
                )}
              </Button>
            </>
          )}
        </div>
      </div>
    </details>
  );
}


function normalizeChart(chart: Chart): Chart {
  return {
    ...chart,
    person: {
      ...chart.person,
      firstName: chart.person?.firstName ?? "",
      lastName: chart.person?.lastName ?? "",
    },
    planets: chart.planets ?? [],
    houses: chart.houses ?? [],
    angles: chart.angles ?? [],
    aspects: chart.aspects ?? [],
    points: chart.points ?? [],
  };
}

function formatBirthLine(chart: Chart): string {
  const parts: string[] = [];
  const rawDate = chart.birth?.date;
  if (typeof rawDate === "string" && rawDate.length >= 8) {
    const date = new Date(`${rawDate}T00:00:00`);
    if (!Number.isNaN(date.getTime())) {
      parts.push(
        date.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }),
      );
    }
  }
  if (typeof chart.birth?.time === "string" && chart.birth.time.length > 0) {
    parts.push(chart.birth.time);
  }
  if (typeof chart.birth?.place === "string" && chart.birth.place.length > 0) {
    parts.push(chart.birth.place);
  }
  return parts.join(" · ");
}

function headerBadges(chart: Chart): string[] {
  const badges: string[] = [];
  const sun = chart.planets?.find((p) => p.planet === "Sun");
  const moon = chart.planets?.find((p) => p.planet === "Moon");
  const asc = chart.angles?.find((a) => a.point === "ASC");
  if (sun !== undefined) badges.push(`☉ ${sun.sign}`);
  if (moon !== undefined) badges.push(`☽ ${moon.sign}`);
  if (asc !== undefined) badges.push(`ASC ${asc.sign}`);
  return badges;
}

class SafeBlock extends React.Component<
  { children: React.ReactNode; silent?: boolean },
  { message: string | null }
> {
  state: { message: string | null } = { message: null };
  static getDerivedStateFromError(error: unknown) {
    return { message: error instanceof Error ? error.message : String(error) };
  }
  render() {
    if (this.state.message !== null) {
      if (this.props.silent === true) return null;
      return (
        <div className="rounded-lg border border-danger/40 bg-danger-soft/30 px-4 py-3 text-xs leading-relaxed text-ink-secondary">
          <p className="font-semibold text-danger">Something went wrong on this page.</p>
          <p className="pt-1 break-all font-mono text-[10px] text-ink-muted">{this.state.message}</p>
          <p className="pt-1">Please send this message to the astrologer.</p>
        </div>
      );
    }
    return this.props.children;
  }
}

function ThemeButton() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return <span className="h-8 w-8" />;
  const dark = resolvedTheme === "dark";
  return (
    <button
      type="button"
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
      onClick={() => setTheme(dark ? "light" : "dark")}
      className="flex h-8 w-8 items-center justify-center rounded-lg border border-line text-ink-muted transition-colors hover:border-line-strong hover:text-ink"
    >
      {dark ? <Sun size={14} /> : <Moon size={14} />}
    </button>
  );
}
