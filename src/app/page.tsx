import Link from "next/link";
import { Sparkles } from "lucide-react";
import { NewsletterForm } from "@/components/landing/newsletter-form";
import { NightPage } from "@/components/landing/night-page";
import { ParisClock } from "@/components/landing/paris-clock";

/**
 * Public landing page while AGS is in private beta: no sign-up, a way to
 * hear the news, and one discreet sign-in (for the owner).
 */
export default function LandingPage() {
  return (
    <NightPage className="flex min-h-[100svh] flex-col items-center justify-center px-4 pb-28 pt-14 text-center">
      <main className="w-full max-w-xl animate-fade-up">
        <div className="flex items-center justify-center gap-2.5">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent text-accent-foreground shadow-glow">
            <Sparkles size={18} />
          </span>
          <span className="text-sm font-semibold tracking-[0.3em] text-ink">AGS</span>
        </div>

        <p className="mt-8 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.06] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-ink-secondary backdrop-blur">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent-hover" />
          Beta
        </p>
        <h1 className="mt-5 text-balance font-serif text-[2.1rem] leading-tight text-ink [text-shadow:0_2px_24px_rgb(4_5_13/0.9)] sm:text-5xl">
          Readings built like language, not like magic.
        </h1>
        <p className="mx-auto mt-5 max-w-md text-pretty text-sm leading-relaxed text-ink-secondary [text-shadow:0_1px_12px_rgb(4_5_13/0.9)] sm:text-base">
          AGS reads birth charts from the real sky, step by step, in plain words. It&apos;s in beta:
          I&apos;m testing it with a small circle for now, so new accounts aren&apos;t open yet.
        </p>

        <section className="mx-auto mt-8 max-w-md rounded-2xl border border-white/10 bg-[#0b0f27]/55 p-5 shadow-pop backdrop-blur-md">
          <h2 className="text-sm font-semibold text-ink">Want to know more?</h2>
          <p className="pb-4 pt-1 text-xs text-ink-muted">Leave your email for the latest news.</p>
          <NewsletterForm source="Landing page" />
        </section>

        <Link
          href="/auth/sign-in"
          className="mt-8 inline-flex h-9 items-center rounded-full border border-white/15 px-5 text-xs font-medium tracking-wide text-ink-secondary transition-colors hover:border-white/30 hover:text-ink"
        >
          Sign in
        </Link>
      </main>

      <ParisClock className="absolute bottom-5 left-5 text-left sm:fixed sm:bottom-6 sm:left-6" />
    </NightPage>
  );
}
