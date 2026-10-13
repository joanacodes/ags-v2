/**
 * Shared shell for the auth pages: the night sky of the landing page
 * behind, no app sidebar.
 */
import Link from "next/link";
import { Sparkles } from "lucide-react";
import { Card } from "@/components/ui/card";
import { NightPage } from "@/components/landing/night-page";

export function AuthCard({
  title,
  description,
  message,
  children,
  footer,
  after,
}: {
  title: string;
  description: string;
  message?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  /** More content below the card (e.g. the newsletter on the sign-in page). */
  after?: React.ReactNode;
}) {
  return (
    <NightPage className="flex min-h-[100svh] items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm animate-fade-up">
        <Link href="/" className="mb-6 flex items-center justify-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent text-accent-foreground shadow-glow">
            <Sparkles size={16} />
          </span>
          <span className="text-sm font-semibold tracking-[0.3em] text-ink">AGS</span>
        </Link>
        <Card className="bg-surface-raised/80 p-6 backdrop-blur-md">
          <h1 className="text-sm font-semibold text-ink">{title}</h1>
          <p className="pt-1 text-xs text-ink-muted">{description}</p>
          {message !== undefined && message !== "" && (
            <p
              role="status"
              className="mt-4 rounded-lg border border-accent/25 bg-accent-soft px-3 py-2.5 text-xs leading-relaxed text-ink-secondary"
            >
              {message}
            </p>
          )}
          <div className="pt-5">{children}</div>
        </Card>
        {footer !== undefined && <div className="pt-4 text-center text-xs text-ink-muted">{footer}</div>}
        {after}
      </div>
    </NightPage>
  );
}
