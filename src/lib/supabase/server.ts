/**
 * Server-side Supabase client bound to the request cookies (auth-aware).
 * Returns null when Supabase is not configured — callers must degrade
 * gracefully to mock behaviour.
 */
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getPublicSupabaseEnvironment } from "./environment";

export function createSupabaseServerClient(): SupabaseClient | null {
  const environment = getPublicSupabaseEnvironment();
  if (environment === null) return null;
  const cookieStore = cookies();
  return createServerClient(environment.url, environment.publishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Called from a Server Component: safe to ignore, the
          // middleware refreshes sessions.
        }
      },
    },
  });
}

/** The signed-in user's id, or null (signed out / unconfigured). */
export async function getServerUserId(): Promise<string | null> {
  const supabase = createSupabaseServerClient();
  if (supabase === null) return null;
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}
