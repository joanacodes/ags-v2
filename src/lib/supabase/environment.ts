/**
 * Supabase environment resolution.
 *
 * Persistence is OPTIONAL: when the variables are absent the app runs
 * exactly as before (mock data, in-memory session charts). Nothing may
 * crash at build time or when unconfigured.
 */

export interface PublicSupabaseEnvironment {
  readonly url: string;
  readonly publishableKey: string;
}

/** Public (browser-safe) configuration, or null when not configured. */
export function getPublicSupabaseEnvironment(): PublicSupabaseEnvironment | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (
    url === undefined || url.trim() === "" ||
    publishableKey === undefined || publishableKey.trim() === ""
  ) {
    return null;
  }
  return { url: url.trim(), publishableKey: publishableKey.trim() };
}

/** True when Supabase persistence is configured. */
export function isSupabaseConfigured(): boolean {
  return getPublicSupabaseEnvironment() !== null;
}
