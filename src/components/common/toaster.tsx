"use client";

/**
 * Minimal notification bubbles: bottom-of-screen, auto-dismissing, stacked.
 * Use via `notify("Reading saved")` from any client component.
 */
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { CheckCircle2, Info, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface Toast {
  id: number;
  message: string;
  tone: "success" | "info";
}

type Notify = (message: string, tone?: Toast["tone"]) => void;

const ToastContext = createContext<Notify>(() => undefined);
let externalNotify: Notify = () => undefined;

/** Imperative helper usable outside React trees (client-side only). */
export function notify(message: string, tone: Toast["tone"] = "success"): void {
  externalNotify(message, tone);
}

export function useNotify(): Notify {
  return useContext(ToastContext);
}

export function Toaster({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const push = useCallback<Notify>((message, tone = "success") => {
    const id = Date.now() + Math.random();
    setToasts((current) => [...current.slice(-2), { id, message, tone }]);
    window.setTimeout(() => {
      setToasts((current) => current.filter((t) => t.id !== id));
    }, 4200);
  }, []);

  useEffect(() => {
    externalNotify = push;
    return () => {
      externalNotify = () => undefined;
    };
  }, [push]);

  return (
    <ToastContext.Provider value={push}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-20 z-[70] flex flex-col items-center gap-2 px-4 lg:bottom-6 print:hidden"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={cn(
              "pointer-events-auto flex w-full max-w-sm items-start gap-2.5 rounded-xl border px-4 py-3 text-xs shadow-pop backdrop-blur",
              toast.tone === "success"
                ? "border-success/30 bg-surface-raised/95 text-ink-secondary"
                : "border-line-strong bg-surface-raised/95 text-ink-secondary",
            )}
          >
            {toast.tone === "success" ? (
              <CheckCircle2 size={14} className="mt-0.5 shrink-0 text-success" />
            ) : (
              <Info size={14} className="mt-0.5 shrink-0 text-accent-hover" />
            )}
            <span className="min-w-0 flex-1 leading-relaxed">{toast.message}</span>
            <button
              type="button"
              aria-label="Dismiss"
              onClick={() => setToasts((c) => c.filter((t) => t.id !== toast.id))}
              className="shrink-0 text-ink-faint transition-colors hover:text-ink"
            >
              <X size={13} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
