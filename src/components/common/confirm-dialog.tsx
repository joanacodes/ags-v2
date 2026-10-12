"use client";

/**
 * Modal yes/no question, usable imperatively from services:
 *   const ok = await confirmDialog({ title, message });
 * Mounted once in Providers. Resolves false on Escape or backdrop click.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
}

type Ask = (options: ConfirmOptions) => Promise<boolean>;

let externalAsk: Ask | null = null;

export function confirmDialog(options: ConfirmOptions): Promise<boolean> {
  if (externalAsk === null) return Promise.resolve(window.confirm(`${options.title}\n\n${options.message}`));
  return externalAsk(options);
}

export function ConfirmDialogHost() {
  const [pending, setPending] = useState<(ConfirmOptions & { resolve: (ok: boolean) => void }) | null>(
    null,
  );
  const confirmRef = useRef<HTMLButtonElement>(null);

  const ask = useCallback<Ask>(
    (options) => new Promise<boolean>((resolve) => setPending({ ...options, resolve })),
    [],
  );

  useEffect(() => {
    externalAsk = ask;
    return () => {
      externalAsk = null;
    };
  }, [ask]);

  useEffect(() => {
    if (pending === null) return;
    confirmRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending]);

  const close = (ok: boolean) => {
    pending?.resolve(ok);
    setPending(null);
  };

  if (pending === null) return null;
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 px-4 print:hidden"
      onClick={() => close(false)}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby="confirm-message"
        className="w-full max-w-md rounded-card border border-line bg-surface-raised p-5 shadow-pop"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-warning-soft text-warning">
            <AlertTriangle size={15} />
          </span>
          <div>
            <h2 id="confirm-title" className="text-sm font-semibold text-ink">
              {pending.title}
            </h2>
            <p id="confirm-message" className="whitespace-pre-line pt-1.5 text-xs leading-relaxed text-ink-muted">
              {pending.message}
            </p>
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={() => close(false)}>
            {pending.cancelLabel ?? "Cancel"}
          </Button>
          <Button ref={confirmRef} variant="primary" size="sm" onClick={() => close(true)}>
            {pending.confirmLabel ?? "OK"}
          </Button>
        </div>
      </div>
    </div>
  );
}
