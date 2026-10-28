import { cookies } from "next/headers";
import { contextFromEnv } from "@/studio/server/context";
import { requireOwner } from "@/studio/server/owner";
import { sameSecret } from "@/studio/server/secrets";
import { Http } from "@/studio/outbox/http";
import { OAUTH } from "@/studio/outbox/oauth";
import { saveToken } from "@/studio/outbox/tokens";
import type { ConnectionKey } from "@/studio/outbox/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request, { params }: { params: { key: string } }): Promise<Response> {
  const owner = await requireOwner();
  if (owner instanceof Response) return owner;
  const url = new URL(req.url);
  const base = (process.env.STUDIO_BASE_URL ?? url.origin).replace(/\/$/, "");
  const back = (q: string) => Response.redirect(`${base}/studio/settings?section=connections&${q}`, 302);
  const provider = OAUTH[params.key as ConnectionKey];
  if (!provider) return back("error=unknown");
  const jar = cookies();
  const name = `studio_oauth_${provider.key}`;
  const saved = jar.get(name)?.value;
  jar.delete(name);
  const denied = url.searchParams.get("error_description") ?? url.searchParams.get("error");
  if (denied) return back(`error=${encodeURIComponent(denied.slice(0, 200))}`);
  let expected: { state: string; verifier: string };
  try {
    expected = JSON.parse(saved ?? "") as { state: string; verifier: string };
  } catch {
    return back("error=the%20connection%20took%20too%20long%3A%20try%20again");
  }
  if (!sameSecret(url.searchParams.get("state"), expected.state)) return back("error=the%20answer%20didn%27t%20match%20the%20request");
  const code = url.searchParams.get("code");
  if (!code) return back("error=no%20code%20came%20back");
  try {
    const made = await provider.exchange({ code, redirectUri: `${base}/api/studio/oauth/${provider.key}/callback`, verifier: expected.verifier, http: new Http(false) });
    const ctx = await contextFromEnv("interactive");
    await saveToken(ctx.store, provider.key, made.token, ctx.now, made.label);
    await ctx.store.logEvent({ table: "studio_connections", rowId: provider.key, from: null, to: "connected", actor: "owner", note: made.label });
    return back(`connected=${provider.key}`);
  } catch (err) {
    return back(`error=${encodeURIComponent((err instanceof Error ? err.message : String(err)).slice(0, 200))}`);
  }
}
