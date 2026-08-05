"use client";

/**
 * Browser Supabase client (publishable key only — never the secret key).
 * Null when Supabase is not configured.
 */
import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getPublicSupabaseEnvironment } from "./environment";

let cached: SupabaseClient | null | undefined;

export function createSupabaseBrowserClient(): SupabaseClient | null {
  if (cached !== undefined) return cached;
  const environment = getPublicSupabaseEnvironment();
  cached = environment === null
    ? null
    : createBrowserClient(environment.url, environment.publishableKey);
  return cached;
}
