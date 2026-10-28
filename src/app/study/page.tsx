"use client";

/**
 * The Astro Study, the owner's side (TASK-0013): today's tests against the daily limit, the fake charts
 * the wrong answers come from, every result (overall, by area, by length, with or without a birth time,
 * by language), every test with its chart, a CSV of every answer, and forgetting a participant.
 */
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Download, ExternalLink, FlaskConical, Loader2, Trash2 } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

interface Tally {
  label: string;
  answered: number;
  recognised: number;
  percent: number;
}

interface Pool {
  target: number;
  fakeCharts: number;
  ready: number;
  model: string;
  promptVersion: string;
}

interface Overview {
  today: number;
  limit: number;
  pool: Pool;
  totals: { tests: number; finished: number; answered: number; recognised: number; percent: number };
  byArea: Tally[];
  byLength: Tally[];
  byTime: Tally[];
  byLanguage: Tally[];
  sessions: {
    id: string;
    createdAt: string;
    name: string;
    email: string;
    language: string;
    length: string;
    timeKnown: boolean;
    news: boolean;
    status: "building" | "stopped" | "ready" | "finished";
    answered: number;
    recognised: number;
    total: number;
    chartId: string | null;
  }[];
}

/** The test is taken on the Astro Study site; AGS is its back end. */
const TEST_ADDRESS = "https://astrostudy.co.uk/test/";

const AREA_NAMES: Readonly<Record<string, string>> = {
  personality: "Personality",
  family: "Family",
  "love-relationships": "Love",
  career: "Career",
  "friends-social": "Friends",
  communication: "Communication",
  "money-resources": "Money",
  "pain-healing": "Pain & healing",
  talents: "Talents",
  "purpose-growth": "Purpose",
};

export default function StudyPage() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [step, setStep] = useState<string | null>(null);

  const load = useCallback(async () => {
    const response = await fetch("/api/study/overview", { cache: "no-store" });
    const body = (await response.json().catch(() => ({}))) as Overview & { error?: { message?: string } };
    if (!response.ok) {
      setError(body.error?.message ?? "The study couldn't be loaded.");
      return;
    }
    setError(null);
    setOverview(body);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /** One step per request (a fake chart, or one language of its statements), until all are ready. */
  const prepare = async () => {
    setPreparing(true);
    setError(null);
    try {
      for (let guard = 0; guard < 200; guard += 1) {
        const response = await fetch("/api/study/decoys", { method: "POST" });
        const body = (await response.json().catch(() => ({}))) as Pool & { did?: string; error?: { message?: string } };
        if (!response.ok) {
          setError(body.error?.message ?? "A step failed. Try again.");
          break;
        }
        setStep(body.did ?? null);
        setOverview((current) => (current === null ? current : { ...current, pool: body }));
        if (body.did === "nothing left to do") break;
      }
    } finally {
      setPreparing(false);
      void load();
    }
  };

  const forget = async (id: string, name: string) => {
    if (!window.confirm(`Delete ${name}'s chart, readings, private link and test? This can't be undone.`)) return;
    const response = await fetch(`/api/study/${id}`, { method: "DELETE" });
    if (!response.ok) {
      setError("The deletion failed. Try again.");
      return;
    }
    void load();
  };

  const pool = overview?.pool;
  const poolReady = pool !== undefined && pool.ready >= pool.target;

  return (
    <AppShell>
      <PageHeader
        title="The Astro Study"
        crumbs={[{ label: "Workspace" }, { label: "Study" }]}
        actions={
          <div className="flex gap-2">
            <a
              href={TEST_ADDRESS}
              target="_blank"
              rel="noopener"
              className="inline-flex h-8 items-center gap-2 rounded-lg border border-line-strong px-3 text-xs font-medium text-ink-secondary transition-colors hover:border-ink-faint hover:text-ink"
            >
              <ExternalLink size={13} /> The test
            </a>
            <a
              href="/api/study/export"
              className="inline-flex h-8 items-center gap-2 rounded-lg border border-line bg-surface-overlay px-3 text-xs font-medium text-ink transition-colors hover:bg-line-strong"
            >
              <Download size={13} /> CSV
            </a>
          </div>
        }
      />
      <main className="flex-1 space-y-5 px-4 py-5 sm:px-6 sm:py-6">
        {error !== null && <Card className="border-danger/40 p-4 text-sm text-danger">{error}</Card>}
        {overview === null && error === null && (
          <p className="flex items-center gap-2 text-sm text-ink-muted">
            <Loader2 size={14} className="animate-spin" /> Loading…
          </p>
        )}

        {overview !== null && (
          <>
            <div className="grid gap-4 sm:grid-cols-3">
              <Card className="p-5">
                <p className="text-xs text-ink-muted">Recognised, all tests</p>
                <p className="pt-1 font-serif text-4xl text-ink">{overview.totals.answered > 0 ? `${overview.totals.percent}%` : "—"}</p>
                <p className="pt-1 text-xs text-ink-faint">
                  {overview.totals.recognised} of {overview.totals.answered} answers · luck alone: 33%
                </p>
              </Card>
              <Card className="p-5">
                <p className="text-xs text-ink-muted">Tests</p>
                <p className="pt-1 font-serif text-4xl text-ink">{overview.totals.finished}</p>
                <p className="pt-1 text-xs text-ink-faint">finished, of {overview.totals.tests} started</p>
              </Card>
              <Card className="p-5">
                <p className="text-xs text-ink-muted">Today (Paris)</p>
                <p className="pt-1 font-serif text-4xl text-ink">
                  {overview.today}
                  <span className="text-xl text-ink-faint"> / {overview.limit}</span>
                </p>
                <Progress value={(overview.today / overview.limit) * 100} className="mt-2" />
              </Card>
            </div>

            <Card className="p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="flex items-center gap-2 text-sm font-semibold text-ink">
                    <FlaskConical size={14} /> Fake charts
                  </h2>
                  <p className="pt-1 text-xs leading-relaxed text-ink-muted">
                    The wrong answers come from {pool?.target} fake charts, written with the same prompt and model as the participants&apos; own.
                    Editing the statement prompt in Settings retires them: prepare them again afterwards.
                  </p>
                </div>
                <Button variant={poolReady ? "outline" : "primary"} size="sm" onClick={() => void prepare()} disabled={preparing}>
                  {preparing ? <Loader2 size={13} className="animate-spin" /> : null}
                  {poolReady ? "Check again" : "Prepare fake charts"}
                </Button>
              </div>
              {pool !== undefined && (
                <>
                  <Progress value={(pool.ready / pool.target) * 100} className="mt-3" />
                  <p className="pt-2 text-xs text-ink-faint">
                    {pool.ready} of {pool.target} ready ({pool.fakeCharts} made) · {pool.model} · prompt {pool.promptVersion}
                    {step !== null && preparing ? ` · ${step}` : ""}
                  </p>
                  {!poolReady && (
                    <p className="pt-1 text-xs text-warning">
                      Until at least one is ready, the test answers &quot;not open yet&quot;. Keep this page open while it prepares: a few minutes.
                    </p>
                  )}
                </>
              )}
            </Card>

            <div className="grid gap-4 lg:grid-cols-2">
              <TallyCard title="By area" rows={overview.byArea.map((t) => ({ ...t, label: AREA_NAMES[t.label] ?? t.label }))} />
              <div className="space-y-4">
                <TallyCard title="By length" rows={overview.byLength} />
                <TallyCard title="Birth time" rows={overview.byTime} />
                <TallyCard title="Language" rows={overview.byLanguage.map((t) => ({ ...t, label: t.label === "fr" ? "French" : "English" }))} />
              </div>
            </div>

            <Card className="overflow-x-auto p-0">
              <table className="w-full min-w-[720px] text-left text-xs">
                <thead className="border-b border-line text-ink-muted">
                  <tr>
                    <th className="px-4 py-3 font-medium">Started</th>
                    <th className="px-4 py-3 font-medium">Name</th>
                    <th className="px-4 py-3 font-medium">Email</th>
                    <th className="px-4 py-3 font-medium">Test</th>
                    <th className="px-4 py-3 font-medium">Recognised</th>
                    <th className="px-4 py-3 font-medium">News</th>
                    <th className="px-4 py-3 font-medium" />
                  </tr>
                </thead>
                <tbody>
                  {overview.sessions.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-4 py-6 text-center text-ink-muted">
                        No tests yet.
                      </td>
                    </tr>
                  )}
                  {overview.sessions.map((s) => (
                    <tr key={s.id} className="border-b border-line last:border-0">
                      <td className="whitespace-nowrap px-4 py-2.5 text-ink-secondary">{new Date(s.createdAt).toLocaleString()}</td>
                      <td className="px-4 py-2.5 text-ink">
                        {s.chartId !== null ? (
                          <Link href={`/charts/${s.chartId}`} className="underline-offset-2 hover:underline">
                            {s.name}
                          </Link>
                        ) : (
                          s.name
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-ink-secondary">{s.email}</td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-ink-secondary">
                        {s.length} · {s.language}
                        {s.timeKnown ? "" : " · no time"}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-ink">
                        {s.status === "finished"
                          ? `${s.recognised} / ${s.answered}`
                          : s.status === "building"
                            ? "preparing"
                            : s.status === "stopped"
                              ? "stopped while preparing"
                              : `in progress (${s.answered}/${s.total})`}
                      </td>
                      <td className="px-4 py-2.5 text-ink-secondary">{s.news ? "yes" : "—"}</td>
                      <td className="px-4 py-2.5 text-right">
                        <button
                          type="button"
                          onClick={() => void forget(s.id, s.name)}
                          className="text-ink-faint hover:text-danger"
                          aria-label={`Delete ${s.name}`}
                          title="Delete this participant (chart, readings, link, test)"
                        >
                          <Trash2 size={13} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          </>
        )}
      </main>
    </AppShell>
  );
}

function TallyCard({ title, rows }: { title: string; rows: Tally[] }) {
  return (
    <Card className="p-5">
      <h2 className="text-sm font-semibold text-ink">{title}</h2>
      {rows.length === 0 ? (
        <p className="pt-2 text-xs text-ink-muted">No finished tests yet.</p>
      ) : (
        <ul className="mt-3 space-y-2.5">
          {rows.map((row) => (
            <li key={row.label}>
              <div className="flex items-baseline justify-between gap-3 text-xs">
                <span className="text-ink-secondary">{row.label}</span>
                <span className="text-ink">
                  {row.percent}% <span className="text-ink-faint">({row.recognised}/{row.answered})</span>
                </span>
              </div>
              <div className="relative mt-1 h-1.5 w-full overflow-hidden rounded-full bg-surface-overlay">
                <div className="h-full rounded-full bg-accent" style={{ width: `${row.percent}%` }} />
                {/* luck alone */}
                <div className="absolute inset-y-0 w-px bg-ink-faint" style={{ left: "33.3%" }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
