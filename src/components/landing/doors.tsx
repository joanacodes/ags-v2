/**
 * The owner's main page: two doors, AGS (birth charts, synastry, readings) and the Studio, under the
 * same night sky as the landing page.
 */
import Link from "next/link";
import { signOut } from "@/app/auth/actions";
import { NightPage } from "./night-page";
import { ParisClock } from "./paris-clock";

function Wheel() {
  const spokes = Array.from({ length: 12 }, (_, i) => (i * Math.PI) / 6);
  return (
    <svg viewBox="0 0 64 64" className="h-14 w-14 text-accent-hover drop-shadow-[0_0_12px_hsl(var(--accent)/0.6)]" fill="none" stroke="currentColor" aria-hidden="true">
      <circle cx="32" cy="32" r="29" strokeWidth="1.5" />
      <circle cx="32" cy="32" r="21" strokeWidth="1" opacity="0.7" />
      <circle cx="32" cy="32" r="6" strokeWidth="1" opacity="0.7" />
      {spokes.map((a) => (
        <line key={a} x1={32 + 21 * Math.cos(a)} y1={32 + 21 * Math.sin(a)} x2={32 + 29 * Math.cos(a)} y2={32 + 29 * Math.sin(a)} strokeWidth="1" opacity="0.8" />
      ))}
      <circle cx="44" cy="20" r="2.2" fill="currentColor" stroke="none" />
      <circle cx="19" cy="38" r="1.6" fill="currentColor" stroke="none" />
    </svg>
  );
}

function Sun() {
  return <span aria-hidden="true" className="block h-14 w-14 rounded-full bg-[radial-gradient(circle_at_35%_35%,#fff6df,#e9b26a_55%,#c76a35)] shadow-[0_0_28px_6px_rgba(255,214,150,.55)]" />;
}

function Door({ href, label, caption, light, mark }: { href: string; label: string; caption: string; light: boolean; mark: React.ReactNode }) {
  return (
    <Link
      href={href}
      className={`group flex aspect-[3/4.3] flex-col items-center justify-center gap-4 rounded-b-3xl rounded-t-full border px-3 pt-6 text-center transition duration-300 hover:-translate-y-1 focus-visible:-translate-y-1 ${
        light
          ? "border-[#e9b26a]/40 bg-[#f3f1ea] text-[#1c211b] shadow-[0_10px_40px_-12px_rgba(255,214,150,.45)] hover:shadow-[0_14px_60px_-10px_rgba(255,214,150,.7)]"
          : "border-white/15 bg-white/[0.06] text-ink shadow-pop backdrop-blur-md hover:border-white/30 hover:bg-white/[0.09]"
      }`}
    >
      {mark}
      <span className="font-serif text-xl leading-tight sm:text-2xl">{label}</span>
      <span className={`text-[11px] leading-snug sm:text-xs ${light ? "text-[#474e44]" : "text-ink-secondary"}`}>{caption}</span>
    </Link>
  );
}

export function Doors() {
  return (
    <NightPage className="flex min-h-[100svh] flex-col items-center justify-center px-4 pb-28 pt-14 text-center">
      <main className="w-full max-w-xl animate-fade-up">
        <p className="text-sm font-semibold tracking-[0.3em] text-ink">AGS</p>
        <p className="mt-2 text-xs uppercase tracking-[0.2em] text-ink-muted">Choose a door</p>
        <div className="mx-auto mt-8 grid max-w-md grid-cols-2 gap-4 sm:gap-6">
          <Door href="/dashboard" label="Open AGS" caption="Birth charts · synastry · readings" light={false} mark={<Wheel />} />
          <Door href="/studio" label="Open Studio" caption="Posts · pictures · files" light mark={<Sun />} />
        </div>
        <form action={signOut} className="mt-10">
          <button className="inline-flex h-9 items-center rounded-full border border-white/15 px-5 text-xs font-medium tracking-wide text-ink-secondary transition-colors hover:border-white/30 hover:text-ink">Sign out</button>
        </form>
      </main>
      <ParisClock className="absolute bottom-5 left-5 text-left sm:fixed sm:bottom-6 sm:left-6" />
    </NightPage>
  );
}
