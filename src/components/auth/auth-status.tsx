"use client";

/**
 * Compact auth block for the sidebar footer. Hidden entirely when
 * Supabase is not configured, so the app looks unchanged in mock mode.
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { LogIn, LogOut } from "lucide-react";
import { signOut } from "@/app/auth/actions";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

export function AuthStatus() {
  const [state, setState] = useState<
    { kind: "unconfigured" } | { kind: "signed-out" } | { kind: "signed-in"; email: string }
  >({ kind: "unconfigured" });

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    if (supabase === null) return;
    let active = true;
    void supabase.auth.getUser().then(({ data }) => {
      if (!active) return;
      setState(
        data.user?.email !== undefined
          ? { kind: "signed-in", email: data.user.email }
          : { kind: "signed-out" },
      );
    });
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      setState(
        session?.user.email !== undefined
          ? { kind: "signed-in", email: session.user.email }
          : { kind: "signed-out" },
      );
    });
    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  if (state.kind === "unconfigured") return null;

  if (state.kind === "signed-out") {
    return (
      <Link
        href="/auth/sign-in"
        className="mb-2 flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-ink-muted transition-colors hover:bg-surface-raised hover:text-ink-secondary"
      >
        <LogIn size={16} />
        Sign in to save charts
      </Link>
    );
  }

  return (
    <div className="mb-2 flex items-center justify-between gap-2 rounded-lg px-3 py-2">
      <span className="min-w-0 truncate text-xs text-ink-muted" title={state.email}>
        {state.email}
      </span>
      <form action={signOut}>
        <button
          type="submit"
          aria-label="Sign out"
          className="flex h-7 w-7 items-center justify-center rounded-md text-ink-faint transition-colors hover:bg-surface-raised hover:text-ink"
        >
          <LogOut size={14} />
        </button>
      </form>
    </div>
  );
}
