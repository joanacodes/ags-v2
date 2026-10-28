import { cookies } from "next/headers";
import { requireOwner } from "@/studio/server/owner";
import { missingEnv, newState, OAUTH, pkce } from "@/studio/outbox/oauth";
import type { ConnectionKey } from "@/studio/outbox/types";

export const dynamic = "force-dynamic";

/**
 * Connect: the owner is sent to the network's consent page. The state and the PKCE verifier stay on our
 * side in a short-lived httpOnly cookie, and the callback refuses any answer that doesn't match them.
 */
export async function GET(req: Request, { params }: { params: { key: string } }): Promise<Response> {
  const owner = await requireOwner();
  if (owner instanceof Response) return owner;
  const provider = OAUTH[params.key as ConnectionKey];
  if (!provider) return Response.json({ error: "this connection has no OAuth flow" }, { status: 404 });
  const missing = missingEnv(provider.key);
  if (missing.length) return Response.json({ error: `set ${missing.join(" and ")} first` }, { status: 503 });
  const base = (process.env.STUDIO_BASE_URL ?? new URL(req.url).origin).replace(/\/$/, "");
  const state = newState();
  const { verifier, challenge } = pkce();
  cookies().set(`studio_oauth_${provider.key}`, JSON.stringify({ state, verifier }), { httpOnly: true, secure: base.startsWith("https"), sameSite: "lax", path: `/api/studio/oauth/${provider.key}`, maxAge: 600 });
  return Response.redirect(provider.authorizeUrl({ redirectUri: `${base}/api/studio/oauth/${provider.key}/callback`, state, challenge }), 302);
}
