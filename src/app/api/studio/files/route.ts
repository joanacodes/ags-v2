import { githubTokenFromEnv, readBaskets } from "@/studio/files/baskets";
import { hydrateKeys } from "@/studio/keys";
import { storesFromEnv } from "@/studio/server/context";
import { requireOwner } from "@/studio/server/owner";

export const dynamic = "force-dynamic";

/**
 * The two baskets' files, as GitHub lists them (kept ten minutes; `?fresh=1` asks again). Owner only, like
 * every Studio route. It needs none of the Studio's tables: without them it reads with the environment's
 * keys, and with no key at all (both repositories are public).
 */
export async function GET(req: Request): Promise<Response> {
  const owner = await requireOwner();
  if (owner instanceof Response) return owner;
  try {
    await loadKeys();
    const view = await readBaskets({ token: githubTokenFromEnv(), fresh: new URL(req.url).searchParams.get("fresh") === "1" });
    return Response.json(view, { headers: { "cache-control": "no-store" } });
  } catch (err) {
    console.error("[studio] files failed", err);
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

/** The keys pasted in Settings → Keys, where the Studio's store is reachable (a GitHub key raises the API's limit). */
async function loadKeys(): Promise<void> {
  try {
    const { store } = await storesFromEnv();
    await hydrateKeys(store);
  } catch (err) {
    console.warn(`[studio] files: reading with the environment's keys only (${err instanceof Error ? err.message : String(err)})`);
  }
}
