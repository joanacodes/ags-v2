/**
 * Session refresh for the Next.js middleware, and the private-beta gate:
 * signed-out visitors only reach the public pages (see `isPublicPath`);
 * any other page sends them to sign in, then back. Pass-through when
 * Supabase is not configured.
 */
import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { afterSignInPath, isPublicPath } from "@/lib/auth-paths";
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
  const { data } = await supabase.auth.getUser();
  const signedIn = data.user !== null;

  // Only page loads are gated: form posts (server actions) answer for themselves.
  if (request.method !== "GET" && request.method !== "HEAD") return response;
  const { pathname, searchParams } = request.nextUrl;

  if (!signedIn && !isPublicPath(pathname)) {
    const asked = new URLSearchParams(searchParams);
    asked.delete("_rsc");
    const query = asked.toString();
    const target = new URL("/auth/sign-in", request.url);
    target.searchParams.set("next", query === "" ? pathname : `${pathname}?${query}`);
    return redirectWith(response, target);
  }
  if (signedIn && (pathname === "/auth/sign-in" || pathname === "/auth/sign-up")) {
    return redirectWith(response, new URL(afterSignInPath(searchParams.get("next")), request.url));
  }
  // No sign-up in the beta: the sign-in page offers the news list instead.
  if (pathname === "/auth/sign-up") return redirectWith(response, new URL("/auth/sign-in", request.url));
  return response;
}

/** A redirect that keeps the refreshed session cookies. */
function redirectWith(response: NextResponse, target: URL): NextResponse {
  const redirect = NextResponse.redirect(target);
  for (const cookie of response.cookies.getAll()) redirect.cookies.set(cookie);
  return redirect;
}
