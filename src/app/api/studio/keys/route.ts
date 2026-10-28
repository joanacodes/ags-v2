import { z } from "zod/v4";
import { body, HttpError, route } from "@/studio/server/api";
import { hydrateKeys, KEY_GROUPS, keyDef, keyLines, vaultName } from "@/studio/keys";

export const dynamic = "force-dynamic";

/** Settings → Keys: what is set and where from. A secret's value never comes back. */
export const GET = route(async () => ({ groups: KEY_GROUPS, ...keyLines() }));

/** Paste a key: it goes to Vault and is in force at once, in this process and in the next worker. */
export const PUT = route(async ({ req, ctx }) => {
  const input = await body(req, z.object({ env: z.string().min(2).max(60), value: z.string().min(1).max(4000) }));
  const def = keyDef(input.env);
  if (!def) throw new HttpError(400, `${input.env} isn't a key the Studio keeps`);
  const value = input.value.trim();
  if (!value) throw new HttpError(400, "the key is empty");
  // A pasted key with a line break or a space inside is almost always a copy gone wrong.
  if (def.secret && /\s/.test(value)) throw new HttpError(400, "the key has a space or a line break in it: copy it again");
  await ctx.store.putSecret(vaultName(def.env), value);
  await ctx.store.logEvent({ table: "studio_keys", rowId: def.env, to: "set", actor: "owner", note: def.secret ? null : `value ${value}` });
  await hydrateKeys(ctx.store, { force: true });
  return { groups: KEY_GROUPS, ...keyLines() };
});

/** Remove a key from the Studio: the environment's value, if any, is in force again. */
export const DELETE = route(async ({ ctx, url }) => {
  const def = keyDef(url.searchParams.get("env") ?? "");
  if (!def) throw new HttpError(400, "which key?");
  await ctx.store.deleteSecret(vaultName(def.env));
  await ctx.store.logEvent({ table: "studio_keys", rowId: def.env, to: "removed", actor: "owner" });
  await hydrateKeys(ctx.store, { force: true });
  return { groups: KEY_GROUPS, ...keyLines() };
});
