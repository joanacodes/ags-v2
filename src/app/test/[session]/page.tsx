"use client";

/**
 * The Astro Study test, the questions and the result (/test/:session, public; TASK-0013). One question
 * at a time, three statements; the right answer only reaches this page once the test is over.
 */
import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Check, Loader2, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { STUDY_COPY } from "@/study/copy";
import type { Letter, StudyLanguage } from "@/study/quiz";

interface View {
  id: string;
  name: string;
  language: StudyLanguage;
  status: "ready" | "finished";
  total: number;
  answered: number;
  current: { position: number; area: string; question: string; options: { key: Letter; text: string }[] } | null;
  result: {
    recognised: number;
    answered: number;
    percent: number;
    chancePercent: number;
    items: { area: string; question: string; own: string; picked: Letter | null; recognised: boolean }[];
    link: string | null;
  } | null;
}

export default function StudySessionPage() {
  const params = useParams<{ session: string }>();
  const id = params.session;
  const [view, setView] = useState<View | null>(null);
  const [missing, setMissing] = useState(false);
  const [sending, setSending] = useState<Letter | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const response = await fetch(`/api/study/${id}`, { cache: "no-store" });
    if (!response.ok) {
      setMissing(true);
      return;
    }
    setView((await response.json()) as View);
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const t = STUDY_COPY[view?.language ?? "en"];

  const answer = async (position: number, key: Letter) => {
    setSending(key);
    setError(null);
    try {
      const response = await fetch(`/api/study/${id}/answer`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ position, answer: key }),
      });
      if (!response.ok) {
        setError(t.problems.default ?? null);
        return;
      }
      setView((await response.json()) as View);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch {
      setError(t.problems.default ?? null);
    } finally {
      setSending(null);
    }
  };

  return (
    <div className="min-h-screen bg-surface-sunken pb-16">
      <header className="mx-auto flex max-w-2xl items-center gap-2.5 px-5 py-5">
        <span className="font-serif text-lg text-ink">{t.brand}</span>
      </header>
      <main className="mx-auto max-w-2xl px-5">
        {missing && <Card className="mt-6 p-6 text-sm text-ink-muted">{t.notFound}</Card>}
        {!missing && view === null && (
          <p className="flex items-center gap-2 pt-10 text-sm text-ink-muted">
            <Loader2 size={14} className="animate-spin" /> {t.loading}
          </p>
        )}

        {view !== null && view.current !== null && (
          <section>
            <p className="pt-2 text-xs font-medium uppercase tracking-wider text-ink-faint">
              {t.questionOf(view.answered + 1, view.total)}
            </p>
            <Progress value={(view.answered / Math.max(view.total, 1)) * 100} className="mt-2" />
            <h1 className="pt-6 font-serif text-2xl text-ink sm:text-3xl">{view.current.question}</h1>
            <p className="pt-1 text-sm text-ink-muted">{t.pick}</p>
            <div className="mt-5 space-y-3">
              {view.current.options.map((option) => (
                <button
                  key={option.key}
                  type="button"
                  disabled={sending !== null}
                  onClick={() => void answer(view.current?.position ?? 0, option.key)}
                  className="flex w-full items-start gap-4 rounded-xl border border-line bg-surface-raised p-4 text-left transition-colors hover:border-accent hover:bg-accent-soft/30 disabled:opacity-60"
                >
                  <span className="font-serif text-2xl leading-none text-accent">{option.key}</span>
                  <span className="text-sm leading-relaxed text-ink">{option.text}</span>
                  {sending === option.key && <Loader2 size={14} className="ml-auto mt-1 shrink-0 animate-spin text-ink-faint" />}
                </button>
              ))}
            </div>
            {error !== null && <p className="pt-3 text-sm text-danger" role="alert">{error}</p>}
          </section>
        )}

        {view !== null && view.result !== null && (
          <section>
            <p className="pt-2 text-xs font-medium uppercase tracking-wider text-ink-faint">{t.resultTitle}</p>
            <p className="pt-3 font-serif text-6xl text-ink">{view.result.percent}%</p>
            <p className="pt-2 text-base text-ink">{t.resultLine(view.result.recognised, view.result.answered)}</p>
            <p className="pt-1 text-sm text-ink-muted">{t.chance(view.result.chancePercent)}</p>

            <Card className="mt-6 p-5">
              <h2 className="font-serif text-xl text-ink">{t.linkTitle}</h2>
              {view.result.link !== null ? (
                <>
                  <p className="pt-2 text-sm leading-relaxed text-ink-secondary">{t.linkText}</p>
                  <p className="pt-2 text-xs leading-relaxed text-ink-muted">{t.password}</p>
                  <a
                    href={view.result.link}
                    className="mt-3 inline-flex h-9 items-center justify-center rounded-lg bg-accent px-4 text-sm font-medium text-accent-foreground transition-colors hover:bg-accent-hover"
                  >
                    {t.openChart}
                  </a>
                  <p className="break-all pt-2 font-mono text-[11px] text-ink-faint">{view.result.link}</p>
                </>
              ) : (
                <p className="pt-2 text-sm text-ink-secondary">{t.noLink}</p>
              )}
            </Card>

            <div className="mt-6 space-y-3">
              {view.result.items.map((item, index) => (
                <Card key={`${item.area}-${index}`} className="p-4">
                  <div className="flex items-start gap-3">
                    <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${item.recognised ? "bg-success-soft text-success" : "bg-surface-overlay text-ink-faint"}`}>
                      {item.recognised ? <Check size={13} /> : <X size={13} />}
                    </span>
                    <div>
                      <p className="text-xs font-medium text-ink-muted">{item.question}</p>
                      <p className="pt-1 text-sm leading-relaxed text-ink">
                        <span className="text-ink-faint">{t.yourChartSaid}: </span>
                        {item.own}
                      </p>
                      <p className="pt-1 text-xs text-ink-faint">{item.recognised ? t.recognised : t.notRecognised}</p>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
