import Link from "next/link";
import {
  ArrowRight,
  BookOpenText,
  Braces,
  FileText,
  Sparkles,
  Telescope,
} from "lucide-react";

/**
 * Public landing page. The app itself lives under /dashboard and friends;
 * signed-out visitors can still explore the demo workspace.
 */
export default function LandingPage() {
  return (
    <div className="min-h-screen bg-surface-sunken">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-6 py-5">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent text-accent-foreground">
            <Sparkles size={16} />
          </span>
          <span className="text-sm font-semibold tracking-wide text-ink">AGS</span>
        </div>
        <nav className="flex items-center gap-2">
          <Link
            href="/auth/sign-in"
            className="rounded-lg px-3.5 py-2 text-sm font-medium text-ink-secondary transition-colors hover:text-ink"
          >
            Sign in
          </Link>
          <Link
            href="/dashboard"
            className="rounded-lg bg-accent px-3.5 py-2 text-sm font-medium text-accent-foreground transition-colors hover:bg-accent-hover"
          >
            Open the app
          </Link>
        </nav>
      </header>

      <main className="mx-auto max-w-5xl px-6">
        <section className="py-16 text-center sm:py-24">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-accent-hover">
            Astrology Grammar System
          </p>
          <h1 className="mx-auto max-w-2xl pt-4 font-serif text-4xl leading-tight text-ink sm:text-5xl">
            Readings built like language, not like magic.
          </h1>
          <p className="mx-auto max-w-xl pt-5 text-sm leading-relaxed text-ink-muted sm:text-base">
            AGS computes your birth chart from real ephemeris data, detects its
            structures with a deterministic grammar, grounds every sentence in a
            curated knowledge base — and only then lets AI write it up, in plain
            words a total beginner can follow.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3 pt-8">
            <Link
              href="/charts/new"
              className="inline-flex items-center gap-2 rounded-lg bg-accent px-5 py-2.5 text-sm font-medium text-accent-foreground transition-colors hover:bg-accent-hover"
            >
              Create your chart
              <ArrowRight size={15} />
            </Link>
            <Link
              href="/charts/chart-clara-mercer"
              className="inline-flex items-center gap-2 rounded-lg border border-line bg-surface-raised px-5 py-2.5 text-sm font-medium text-ink-secondary transition-colors hover:border-line-strong hover:text-ink"
            >
              Explore the demo chart
            </Link>
          </div>
        </section>

        <section className="grid gap-4 pb-20 sm:grid-cols-3">
          <FeatureCard
            icon={<Telescope size={16} />}
            title="Real calculation"
            body="Positions, houses, aspects, retrogrades, Chiron, Lilith, the Nodes and the Vertex — computed from Swiss-ephemeris data, never guessed."
          />
          <FeatureCard
            icon={<Braces size={16} />}
            title="Grammar before AI"
            body="A deterministic engine detects the chart's structures and composes grounded sentences from the knowledge base. Same chart, same sentences — always."
          />
          <FeatureCard
            icon={<BookOpenText size={16} />}
            title="Readings that teach"
            body="Eleven life domains, written for beginners: mechanics explained inline, concrete everyday examples, and a full editable report with glossary."
          />
        </section>

        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-line py-8 text-xs text-ink-faint">
          <span>AGS · Astrology Grammar System</span>
          <span className="inline-flex items-center gap-1.5">
            <FileText size={12} />
            Reports are descriptive, never predictive advice.
          </span>
        </footer>
      </main>
    </div>
  );
}

function FeatureCard({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-card border border-line bg-surface-raised p-5 shadow-card">
      <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent-soft text-accent-hover">
        {icon}
      </span>
      <h2 className="pt-3 text-sm font-semibold text-ink">{title}</h2>
      <p className="pt-1.5 text-xs leading-relaxed text-ink-muted">{body}</p>
    </div>
  );
}
