/**
 * Tokens live in Supabase Vault as JSON, one secret per connection (`studio:conn-<key>`), and are never
 * sent to a browser. The studio_connections row holds what Settings may show: the state, the account's
 * name, the scopes and the expiry.
 */
import type { ConnectionRow } from "../store/rows";
import type { StudioStore } from "../store/store";
import type { ConnectionKey, Token } from "./types";

export const secretName = (key: ConnectionKey) => `conn-${key}`;

export async function loadToken(store: StudioStore, key: ConnectionKey): Promise<Token | null> {
  const raw = await store.secret(secretName(key));
  if (!raw) return null;
  try {
    const t = JSON.parse(raw) as Partial<Token>;
    if (typeof t.access_token === "string" && t.access_token && t.account && typeof t.account === "object") return t as Token;
  } catch {
    // A secret that isn't our JSON is treated as no connection: Settings then offers Connect again.
  }
  return null;
}

/** The state Settings shows. A token that refreshes itself only expires when its refresh token does. */
export function statusOf(token: Token, now: Date): ConnectionRow["status"] {
  const end = token.refresh_token ? token.account["refresh_expires_at"] : token.expires_at;
  if (!end) return "connected";
  const left = Date.parse(end) - now.getTime();
  if (Number.isNaN(left)) return "connected";
  if (left <= 0) return "expired";
  if (left < 7 * 86400_000) return "expiring";
  return "connected";
}

/** When the owner must reconnect, if ever. */
export function reconnectBy(token: Token): string | null {
  return (token.refresh_token ? token.account["refresh_expires_at"] : token.expires_at) ?? null;
}

export async function saveToken(store: StudioStore, key: ConnectionKey, token: Token, now: Date, label?: string | null): Promise<void> {
  const id = await store.putSecret(secretName(key), JSON.stringify(token));
  const existing = (await store.connections()).find((c) => c.platform === key);
  await store.upsertConnection({
    platform: key,
    status: statusOf(token, now),
    account_label: label ?? existing?.account_label ?? token.account["username"] ?? token.account["handle"] ?? null,
    account_ref: token.account["user_id"] ?? token.account["ig_user_id"] ?? token.account["channel_id"] ?? token.account["did"] ?? token.account["open_id"] ?? existing?.account_ref ?? null,
    scopes: [...(token.scopes ?? existing?.scopes ?? [])],
    expires_at: reconnectBy(token),
    vault_secret_id: id,
    meta: { ...(existing?.meta ?? {}), refreshed_at: now.toISOString() },
  });
}

export async function disconnect(store: StudioStore, key: ConnectionKey): Promise<void> {
  await store.deleteSecret(secretName(key));
  const existing = (await store.connections()).find((c) => c.platform === key);
  await store.upsertConnection({
    platform: key,
    status: "disconnected",
    account_label: existing?.account_label ?? null,
    account_ref: null,
    scopes: [],
    expires_at: null,
    vault_secret_id: null,
    meta: { ...(existing?.meta ?? {}), disconnected_at: new Date().toISOString() },
  });
}
