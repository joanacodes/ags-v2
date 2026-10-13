/**
 * Server-side Supabase client bound to the request cookies (auth-aware).
 * Returns null when Supabase is not configured — callers must degrade
 * gracefully to mock behaviour.
 */
import { AsyncLocalStorage } from "node:async_hooks";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getPublicSupabaseEnvironment } from "./environment";

/**
 * Background jobs run without a browser session: inside `runAsUser` every
 * store uses the server's own client on behalf of that user instead of the
 * request cookies.
 */
const actingAs = new AsyncLocalStorage<{ client: SupabaseClient; userId: string }>();

export function runAsUser<T>(client: SupabaseClient, userId: string, task: () => Promise<T>): Promise<T> {
  return actingAs.run({ client, userId }, task);
}

/**
 * Client with the Supabase secret key (bypasses RLS). Server-only, used by
 * the background job runner; null when SUPABASE_SECRET_KEY is not set.
 */
export function createSupabaseServiceClient(): SupabaseClient | null {
  const environment = getPublicSupabaseEnvironment();
  const secretKey = process.env.SUPABASE_SECRET_KEY?.trim();
  if (environment === null || secretKey === undefined || secretKey === "") return null;
  return createClient(environment.url, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function createSupabaseServerClient(): SupabaseClient | null {
  const scope = actingAs.getStore();
  if (scope !== undefined) return scope.client;
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

/**
 * Routes that spend money (AI, astrology service) call this first: a 401
 * when the app is connected to Supabase and nobody is signed in. Local
 * demo mode (no Supabase) and background jobs are let through.
 */
export async function requireSignedIn(): Promise<NextResponse | null> {
  if (actingAs.getStore() !== undefined) return null;
  if (getPublicSupabaseEnvironment() === null) return null;
  if ((await getServerUserId()) !== null) return null;
  return NextResponse.json(
    { error: { code: "SIGN_IN_REQUIRED", message: "Sign in to use this." } },
    { status: 401 },
  );
}

/** The signed-in user's id, or null (signed out / unconfigured). */
export async function getServerUserId(): Promise<string | null> {
  const scope = actingAs.getStore();
  if (scope !== undefined) return scope.userId;
  const supabase = createSupabaseServerClient();
  if (supabase === null) return null;
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}
