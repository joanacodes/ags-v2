/**
 * Private beta: which pages anyone can open, and where to send someone
 * after they sign in. Pure (unit-tested), shared by the middleware, the
 * sign-in action and the auth callback.
 */

/**
 * Open to everyone: the landing page, the auth pages, the readings shared
 * with readees (/r/…), Next.js internals and static files. Everything else
 * needs a signed-in session.
 */
export function isPublicPath(pathname: string): boolean {
  if (pathname === "/") return true;
  if (pathname === "/auth" || pathname.startsWith("/auth/")) return true;
  if (pathname.startsWith("/r/")) return true;
  // App folders starting with "_" never route, so this is only Next.js itself.
  if (pathname.startsWith("/_")) return true;
  return /\/[^/]+\.[a-z0-9]+$/i.test(pathname);
}

/**
 * `next` when it is a path on this site; anything else (another site, a
 * protocol-relative "//host" or a "/\host" that browsers read the same way)
 * gives `fallback`.
 */
export function safeNextPath(next: string | null | undefined, fallback: string): string {
  if (typeof next !== "string" || !next.startsWith("/")) return fallback;
  if (next.startsWith("//") || next.includes("\\")) return fallback;
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(next)) return fallback;
  return next;
}

/** Where to land after signing in: the page asked for, else the dashboard (never back to the auth pages). */
export function afterSignInPath(next: string | null | undefined): string {
  const path = safeNextPath(next, "/dashboard");
  return path === "/auth" || path.startsWith("/auth/") || path.startsWith("/auth?") ? "/dashboard" : path;
}
