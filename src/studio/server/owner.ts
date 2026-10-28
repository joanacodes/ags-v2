/**
 * Who is asking. The Studio has one user: the owner, whose Supabase user id is STUDY_OWNER_USER_ID (the
 * same architect id the Astro Study test uses).
 * Every screen and every route checks it on the server; the tables' row security checks it again
 * (studio_is_owner()), so a mistake in one place is still caught in the other.
 *
 * STUDIO_DEV_OWNER=1 lets a laptop run the screens without Supabase; it is ignored in production.
 */
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { getPublicSupabaseEnvironment } from "@/lib/supabase/environment";

export type Viewer = { readonly kind: "owner"; readonly id: string } | { readonly kind: "stranger"; readonly id: string } | { readonly kind: "signed-out" };

export function devOwner(): boolean {
  return process.env.NODE_ENV !== "production" && process.env.STUDIO_DEV_OWNER === "1";
}

export async function viewer(): Promise<Viewer> {
  const ownerId = (process.env.STUDY_OWNER_USER_ID ?? "").trim();
  if (devOwner()) return { kind: "owner", id: ownerId || "dev-owner" };
  const env = getPublicSupabaseEnvironment();
  if (!env) return { kind: "signed-out" };
  const store = cookies();
  const supabase = createServerClient(env.url, env.publishableKey, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          for (const { name, value, options } of list) store.set(name, value, options);
        } catch {
          // A server component can't set cookies; the middleware refreshes the session instead.
        }
      },
    },
  });
  const { data } = await supabase.auth.getUser();
  if (!data.user) return { kind: "signed-out" };
  return ownerId && data.user.id === ownerId ? { kind: "owner", id: data.user.id } : { kind: "stranger", id: data.user.id };
}

/** For route handlers: the owner's id, or the response to send instead. */
export async function requireOwner(): Promise<{ id: string } | Response> {
  const v = await viewer();
  if (v.kind === "owner") return { id: v.id };
  return Response.json({ error: v.kind === "signed-out" ? "sign in first" : "the Studio belongs to its owner" }, { status: v.kind === "signed-out" ? 401 : 403 });
}
