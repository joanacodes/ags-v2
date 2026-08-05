/**
 * Shared shell for the auth pages — v2 design system, no app sidebar.
 */
import Link from "next/link";
import { Sparkles } from "lucide-react";
import { Card } from "@/components/ui/card";

export function AuthCard({
  title,
  description,
  message,
  children,
  footer,
}: {
  title: string;
  description: string;
  message?: string;
  children: React.ReactNode;
  footer: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-sunken px-4">
      <div className="w-full max-w-sm">
        <Link href="/dashboard" className="mb-6 flex items-center justify-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent text-accent-foreground">
            <Sparkles size={16} />
          </span>
          <span className="text-sm font-semibold tracking-wide text-ink">AGS</span>
        </Link>
        <Card className="p-6">
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
        <div className="pt-4 text-center text-xs text-ink-muted">{footer}</div>
      </div>
    </div>
  );
}
