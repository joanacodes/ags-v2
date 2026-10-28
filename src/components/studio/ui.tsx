"use client";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { createPortal } from "react-dom";

const PARIS = "Europe/Paris";

export function paris(iso: string | null | undefined, style: "time" | "day" | "full" | "date" = "full"): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const opts: Intl.DateTimeFormatOptions =
    style === "time" ? { hour: "2-digit", minute: "2-digit", hourCycle: "h23" } : style === "day" ? { weekday: "short", day: "numeric", month: "short" } : style === "date" ? { day: "numeric", month: "short", year: "numeric" } : { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" };
  return new Intl.DateTimeFormat("en-GB", { timeZone: PARIS, ...opts }).format(d);
}

export function ago(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return "never";
  const s = Math.round((now - Date.parse(iso)) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} d ago`;
}

export const money = (n: number | null | undefined) => (n === null || n === undefined ? "—" : `$${n.toFixed(2)}`);

const STATUS_STYLE: Record<string, string> = {
  draft: "bg-ink/5 text-ink-2",
  approved: "bg-sky-soft text-sky",
  rendered: "bg-sky-soft text-sky",
  queued: "bg-gold-soft text-[#8a5a12]",
  posted: "bg-moss-soft text-moss",
  sent: "bg-moss-soft text-moss",
  ok: "bg-moss-soft text-moss",
  done: "bg-moss-soft text-moss",
  connected: "bg-moss-soft text-moss",
  failed: "bg-rust-soft text-rust",
  expired: "bg-rust-soft text-rust",
  killed: "bg-ink/10 text-ink-3 line-through",
  skipped: "bg-ink/5 text-ink-3",
  cancelled: "bg-ink/5 text-ink-3",
  expiring: "bg-gold-soft text-[#8a5a12]",
  disconnected: "bg-ink/5 text-ink-3",
  running: "bg-sky-soft text-sky",
  capped: "bg-gold-soft text-[#8a5a12]",
  dry_run: "bg-gold-soft text-[#8a5a12]",
  scheduled: "bg-ink/5 text-ink-2",
  snoozed: "bg-ink/5 text-ink-2",
  used: "bg-moss-soft text-moss",
};

export function Status({ value, label }: { value: string; label?: string }) {
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_STYLE[value] ?? "bg-ink/5 text-ink-2"}`}>{label ?? value.replace("_", " ")}</span>;
}

const DOT: Record<string, string> = { off: "bg-ink/25", ok: "bg-moss", running: "bg-sky animate-pulse", waiting: "bg-gold", failed: "bg-rust" };
export function Dot({ status, title }: { status: string; title?: string }) {
  return <span title={title ?? status} aria-label={title ?? status} className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${DOT[status] ?? "bg-ink/25"}`} />;
}

export function Section({ title, count, action, children, id }: { title: string; count?: number; action?: React.ReactNode; children: React.ReactNode; id?: string }) {
  return (
    <section id={id} className="mt-8 first:mt-0">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="text-xl">
          {title}
          {count !== undefined && <span className="ml-2 font-sans text-sm text-ink-3">{count}</span>}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="rounded-2xl border border-dashed border-line-2 px-4 py-6 text-center text-sm text-ink-3">{children}</p>;
}

export function Loading({ label = "Loading" }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 py-8 text-sm text-ink-3" role="status">
      <span className="h-3 w-3 animate-spin rounded-full border-2 border-ink/20 border-t-ink/60" />
      {label}…
    </div>
  );
}

export function ErrorNote({ error, retry }: { error: string; retry?: () => void }) {
  return (
    <div className="rounded-2xl bg-rust-soft p-4 text-sm text-rust" role="alert">
      {error}
      {retry && (
        <button className="btn btn-sm ml-3" onClick={retry}>
          Try again
        </button>
      )}
    </div>
  );
}

export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="btn btn-sm"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
        } catch {
          const t = document.createElement("textarea");
          t.value = text;
          document.body.appendChild(t);
          t.select();
          document.execCommand("copy");
          t.remove();
        }
        setDone(true);
        setTimeout(() => setDone(false), 1500);
      }}
    >
      {done ? "Copied" : label}
    </button>
  );
}

/**
 * A side panel on a laptop, a bottom sheet on a phone; Escape closes it. It is drawn at the top of the
 * page (a portal): inside the header, whose blur makes "fixed" mean "fixed to the header", it would open
 * off-screen.
 */
export function Sheet({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: React.ReactNode; children: React.ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [open, onClose]);
  if (!open || typeof document === "undefined") return null;
  // Portaled to the body, out of the header's backdrop blur (which would trap a fixed sheet); the
  // wrapper carries the .studio scope there, or the Studio's styles wouldn't reach it.
  return createPortal(
    <div className="studio">
      <div className="fixed inset-0 z-50" role="dialog" aria-modal="true">
        <button className="absolute inset-0 bg-ink/30" aria-label="Close" onClick={onClose} />
        <div className={`absolute inset-x-0 bottom-0 max-h-[88vh] overflow-y-auto rounded-t-3xl bg-paper p-5 shadow-sheet md:inset-y-0 md:left-auto md:right-0 md:max-h-none md:rounded-none md:rounded-l-3xl ${wide ? "md:w-[640px]" : "md:w-[460px]"}`}>
          <div className="mb-4 flex items-start justify-between gap-3">
            <h2 className="text-2xl">{title}</h2>
            <button className="btn btn-quiet btn-sm" onClick={onClose} aria-label="Close">
              ✕
            </button>
          </div>
          {children}
        </div>
      </div>
    </div>,
    document.body,
  );
}

type Toast = { id: number; text: string; tone: "ok" | "error" };
const ToastContext = createContext<(text: string, tone?: "ok" | "error") => void>(() => undefined);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((text: string, tone: "ok" | "error" = "ok") => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, text, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), tone === "error" ? 7000 : 3500);
  }, []);
  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-20 z-[60] flex flex-col items-center gap-2 px-4 md:bottom-6" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`pointer-events-auto max-w-md rounded-2xl px-4 py-3 text-sm shadow-soft ${t.tone === "error" ? "bg-rust text-white" : "bg-ink text-paper"}`}>
            {t.text}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);

/** Run an action with a busy state and a toast; returns the result or null when it failed. */
export function useAction() {
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const run = useCallback(
    async <T,>(key: string, work: () => Promise<T>, done?: string | ((r: T) => string)): Promise<T | null> => {
      setBusy(key);
      try {
        const r = await work();
        if (done) toast(typeof done === "function" ? done(r) : done);
        return r;
      } catch (err) {
        toast(err instanceof Error ? err.message : String(err), "error");
        return null;
      } finally {
        setBusy(null);
      }
    },
    [toast],
  );
  return { busy, run };
}

export function Toggle({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 py-1 text-sm">
      <span>{label}</span>
      <button type="button" role="switch" aria-checked={checked} disabled={disabled} onClick={() => onChange(!checked)} className={`relative h-6 w-11 shrink-0 rounded-full transition ${checked ? "bg-moss" : "bg-ink/20"} disabled:opacity-50`}>
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition ${checked ? "left-[22px]" : "left-0.5"}`} />
      </button>
    </label>
  );
}

export function Tabs({ tabs, active, onChange }: { tabs: readonly { id: string; label: string; count?: number }[]; active: string; onChange: (id: string) => void }) {
  return (
    <div className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0" role="tablist">
      <div className="flex min-w-max gap-1 border-b border-line">
        {tabs.map((t) => (
          <button key={t.id} role="tab" aria-selected={t.id === active} onClick={() => onChange(t.id)} className={`relative px-3 py-2 text-sm ${t.id === active ? "font-medium text-ink" : "text-ink-3 hover:text-ink"}`}>
            {t.label}
            {t.count !== undefined && t.count > 0 && <span className="ml-1 text-xs text-ink-3">{t.count}</span>}
            {t.id === active && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-accent" />}
          </button>
        ))}
      </div>
    </div>
  );
}
