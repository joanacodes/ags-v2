"use client";

/**
 * Readee link controls: create a link, copy it or send it with the phone's
 * share sheet. The link's password is the readee's birth date (DDMMYYYY).
 * Used by the share card (wide screens) and the share dialog (everywhere).
 */
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, Loader2, Plus, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { notify } from "@/components/common/toaster";

interface ShareLink {
  token: string;
  created_at: string;
}

function linkUrl(token: string): string {
  return `${window.location.origin}/r/${token}`;
}

export function formatSharePassword(birthDate: string | undefined): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(birthDate ?? "");
  return match === null ? "their birth date" : `${match[3]}${match[2]}${match[1]}`;
}

export function SharePanel({
  chartId,
  birthDate,
  personName,
}: {
  chartId: string;
  birthDate?: string;
  personName?: string;
}) {
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [canShare, setCanShare] = useState(false);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  useEffect(() => setCanShare(typeof navigator !== "undefined" && typeof navigator.share === "function"), []);

  const { data: links, isLoading } = useQuery({
    queryKey: ["share-links", chartId],
    queryFn: async (): Promise<ShareLink[]> => {
      const response = await fetch(`/api/charts/${chartId}/share`);
      if (!response.ok) return [];
      const body = (await response.json()) as { links: ShareLink[] };
      return body.links;
    },
  });

  const create = async () => {
    setCreating(true);
    setError(null);
    try {
      const response = await fetch(`/api/charts/${chartId}/share`, { method: "POST" });
      const body = (await response.json()) as { error?: { message?: string } };
      if (!response.ok) {
        setError(body.error?.message ?? "Could not create the link.");
        return;
      }
      notify("Readee link created.");
      await queryClient.invalidateQueries({ queryKey: ["share-links", chartId] });
    } finally {
      setCreating(false);
    }
  };

  const copy = (token: string) => {
    navigator.clipboard.writeText(linkUrl(token)).then(
      () => {
        // The button itself turns into a green "Copied" (a toast would sit on top of it on phones).
        setCopiedToken(token);
        window.setTimeout(() => setCopiedToken((current) => (current === token ? null : current)), 2500);
      },
      () => setError("Couldn't copy automatically — press and hold the link to copy it."),
    );
  };

  const share = (token: string) => {
    const password = formatSharePassword(birthDate);
    navigator
      .share({
        title: personName ? `${personName} — your birth chart reading` : "Your birth chart reading",
        text: `Here is your reading. To open it, enter your date of birth as 8 digits, day first (DDMMYYYY): ${password}.`,
        url: linkUrl(token),
      })
      .catch(() => undefined); // closing the share sheet is not an error
  };

  const latest = links?.[0];
  const older = links?.slice(1) ?? [];

  return (
    <div className="space-y-3">
      <p className="text-xs leading-relaxed text-ink-muted">
        The readee opens the link with their date of birth as the password (no account),
        rates each reading, and their notes come back to you on the reading pages.
      </p>
      <p className="rounded-lg border border-line bg-surface px-3 py-2 text-xs text-ink-muted">
        Password:{" "}
        <span className="font-mono font-semibold text-ink">{formatSharePassword(birthDate)}</span>{" "}
        <span className="text-ink-faint">(DDMMYYYY)</span>
      </p>

      {isLoading ? (
        <p className="text-xs text-ink-muted">Loading links…</p>
      ) : latest === undefined ? (
        <Button variant="primary" className="w-full" onClick={() => void create()} disabled={creating}>
          {creating ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
          Create the readee link
        </Button>
      ) : (
        <>
          <LinkRow
            token={latest.token}
            canShare={canShare}
            copied={copiedToken === latest.token}
            onCopy={copy}
            onShare={share}
          />
          {older.length > 0 && (
            <details className="text-xs text-ink-muted">
              <summary className="cursor-pointer">Older links ({older.length})</summary>
              <div className="space-y-2 pt-2">
                {older.map((link) => (
                  <LinkRow
                    key={link.token}
                    token={link.token}
                    canShare={canShare}
                    copied={copiedToken === link.token}
                    onCopy={copy}
                    onShare={share}
                  />
                ))}
              </div>
            </details>
          )}
          <Button size="sm" variant="ghost" onClick={() => void create()} disabled={creating}>
            {creating ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
            New link
          </Button>
        </>
      )}
      {error !== null && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}

function LinkRow({
  token,
  canShare,
  copied,
  onCopy,
  onShare,
}: {
  token: string;
  canShare: boolean;
  copied: boolean;
  onCopy: (token: string) => void;
  onShare: (token: string) => void;
}) {
  const [url, setUrl] = useState(`/r/${token}`);
  useEffect(() => setUrl(linkUrl(token)), [token]);
  return (
    <div className="space-y-2">
      <Input
        readOnly
        value={url}
        onFocus={(event) => event.currentTarget.select()}
        className="h-9 text-xs"
        aria-label="Readee link"
      />
      <div className="flex gap-2">
        <Button
          size="sm"
          variant="outline"
          className={
            copied
              ? "flex-1 border-success/50 bg-success-soft text-success hover:border-success/50 hover:text-success"
              : "flex-1"
          }
          onClick={() => onCopy(token)}
          aria-live="polite"
        >
          {copied ? <Check size={12} /> : <Copy size={12} />}
          {copied ? "Copied" : "Copy link"}
        </Button>
        {canShare && (
          <Button size="sm" variant="primary" className="flex-1" onClick={() => onShare(token)}>
            <Send size={12} />
            Send…
          </Button>
        )}
      </div>
    </div>
  );
}

/** The share panel in a popup, usable from any page or card. */
export function ShareDialog({
  open,
  onClose,
  chartId,
  birthDate,
  personName,
}: {
  open: boolean;
  onClose: () => void;
  chartId: string;
  birthDate?: string;
  personName?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;
  // Portal: cards are animated (transformed), which would trap a fixed overlay.
  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/50 sm:items-center sm:px-4 print:hidden"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="share-dialog-title"
        className="w-full max-w-md rounded-t-2xl border border-line bg-surface-raised p-5 shadow-pop sm:rounded-card"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between pb-3">
          <h2 id="share-dialog-title" className="text-sm font-semibold text-ink">
            Share with {personName ?? "the readee"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-md p-1 text-ink-muted transition-colors hover:text-ink"
          >
            <X size={15} />
          </button>
        </div>
        <SharePanel chartId={chartId} birthDate={birthDate} personName={personName} />
      </div>
    </div>,
    document.body,
  );
}
