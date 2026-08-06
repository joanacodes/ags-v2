"use client";

/**
 * Public readee page (/r/:token): no account needed. A password unlocks the
 * shared readings; the readee rates each one (1-5 stars) and leaves notes
 * that the astrologer sees on the reading pages.
 */
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Loader2, Lock, Send, Sparkles, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { renderInline } from "@/lib/rich-text";
import type { Reading } from "@/types";

interface SharedPayload {
  person: string;
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
          <>
            <div className="pb-2 pt-4">
              <h1 className="font-serif text-2xl text-ink">{payload.person}</h1>
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
              {payload.readings.map((reading, index) => (
                <SharedReading
                  key={reading.slug}
                  reading={reading}
                  token={token}
                  password={password}
                  author={author}
                  defaultOpen={index === 0}
                />
              ))}
            </div>
          </>
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
  defaultOpen,
}: {
  reading: Reading;
  token: string;
  password: string;
  author: string;
  defaultOpen: boolean;
}) {
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    <details
      open={defaultOpen}
      className="group rounded-card border border-line bg-surface-raised shadow-card"
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4">
        <span className="text-sm font-semibold text-ink">{reading.title}</span>
        <span className="text-xs text-ink-faint transition-transform group-open:rotate-90">›</span>
      </summary>

      <div className="border-t border-line px-5 py-4">
        {reading.sections.map((section) => (
          <div key={section.id} className="pb-4">
            <h3 className="pb-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-muted">
              {section.heading}
            </h3>
            {section.paragraphs.map((paragraph, index) => (
              <p key={index} className="pb-2.5 font-serif text-sm leading-relaxed text-ink-secondary">
                {renderInline(paragraph)}
              </p>
            ))}
            {section.keyInsight !== undefined && (
              <p className="mb-2.5 rounded-lg border border-accent/25 bg-accent-soft px-3.5 py-2.5 text-xs leading-relaxed text-ink-secondary">
                <span className="font-semibold">{section.keyInsight.eyebrow}: </span>
                {section.keyInsight.body}
              </p>
            )}
          </div>
        ))}

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
