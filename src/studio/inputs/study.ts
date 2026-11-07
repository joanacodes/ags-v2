/**
 * The Study's numbers as figures the agents may quote: each one exact, labelled, with its source and its
 * week. The agents get these lines and nothing else to cite, and the code checks every figure on a card
 * against them, so "7 in 10" can only appear if the Study page says so that week.
 */
import type { StudySessionRow } from "../store/rows";
import type { Figure } from "../types";

export interface StudySummary {
  readonly started: number;
  readonly finished: number;
  readonly answers: number;
  readonly recognised: number;
  readonly optIns: number;
  readonly bySource: Readonly<Record<string, { started: number; finished: number }>>;
  readonly figures: readonly Figure[];
}

const pct = (n: number, d: number) => (d === 0 ? 0 : Math.round((n / d) * 1000) / 10);

export function summariseStudy(rows: readonly StudySessionRow[], label: string): StudySummary {
  const real = rows.filter((r) => r.status !== "building");
  const finished = real.filter((r) => r.status === "finished");
  const answers = finished.reduce((n, r) => n + r.answered, 0);
  const recognised = finished.reduce((n, r) => n + r.recognised, 0);
  const optIns = real.filter((r) => r.news_consent_at !== null).length;
  const bySource: Record<string, { started: number; finished: number }> = {};
  for (const r of real) {
    const src = (r.source ?? "direct").toLowerCase();
    const entry = (bySource[src] ??= { started: 0, finished: 0 });
    entry.started += 1;
    if (r.status === "finished") entry.finished += 1;
  }
  const source = `the Study page, ${label}`;
  const figures: Figure[] = [];
  if (real.length > 0) {
    figures.push({ value: String(real.length), label: "tests started", source, verified: true });
    figures.push({ value: String(finished.length), label: "tests finished", source, verified: true });
  }
  if (answers >= 30) {
    const rate = pct(recognised, answers);
    figures.push({ value: `${rate}%`, label: `of answers picked the person's own description (${recognised} of ${answers}; luck is 33.3%)`, source, verified: true });
    const inTen = Math.floor((recognised / answers) * 100) / 10;
    figures.push({ value: `${inTen} in 10`, label: "answers picked the person's own description", source, verified: true });
  }
  if (real.length >= 20) figures.push({ value: `${pct(optIns, real.length)}%`, label: "ticked the news box", source, verified: true });
  return { started: real.length, finished: finished.length, answers, recognised, optIns, bySource, figures };
}

/** Lines a model reads: one figure per line, value | label | source. */
export function figureLines(figures: readonly Figure[]): string {
  if (figures.length === 0) return "(no figures this week: the Study has too few tests yet. Use no figure.)";
  return figures.map((f) => `${f.value} | ${f.label} | ${f.source}`).join("\n");
}
