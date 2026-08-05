/**
 * Session refresh for the Next.js middleware. Pass-through when Supabase
 * is not configured.
 */
import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { getPublicSupabaseEnvironment } from "./environment";

export async function refreshSession(request: NextRequest): Promise<NextResponse> {
  const environment = getPublicSupabaseEnvironment();
  if (environment === null) return NextResponse.next({ request });

  let response = NextResponse.next({ request });
  const supabase = createServerClient(environment.url, environment.publishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });
  // Touch the session so expired tokens are refreshed.
  await supabase.auth.getUser();
  return response;
}
