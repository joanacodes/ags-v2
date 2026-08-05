import Link from "next/link";
import { Compass } from "lucide-react";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-accent-soft text-accent-hover">
        <Compass size={22} />
      </span>
      <p className="mt-6 text-xs font-semibold uppercase tracking-[0.2em] text-ink-faint">
        Error 404
      </p>
      <h1 className="mt-2 font-serif text-3xl font-semibold text-ink">
        This page isn&apos;t on the chart
      </h1>
      <p className="mt-3 max-w-md text-sm leading-relaxed text-ink-muted">
        The address doesn&apos;t match anything in this workspace. It may have moved, or the link
        is out of date.
      </p>
      <Link
        href="/dashboard"
        className="mt-7 inline-flex h-10 items-center rounded-lg bg-accent px-5 text-sm font-medium text-white transition-colors hover:bg-accent-hover"
      >
        Back to Dashboard
      </Link>
    </div>
  );
}
