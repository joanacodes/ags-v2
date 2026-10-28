/**
 * The clock's own secret. The tick route is called by pg_cron with a bearer that lives in Vault only:
 * the Studio makes it when the owner starts the clock (Settings → Schedules → The clock) and reads it
 * back to check each call. AGS's CRON_SECRET is not used for this: on Cloudflare it changes with every
 * deploy, and Vercel may not have one. A Vercel cron can still stand in with CRON_SECRET when one is set.
 */
import { randomBytes } from "node:crypto";
import { sameSecret } from "../server/secrets";
import type { StudioStore } from "../store/store";

export const TICK_PATH = "/api/studio/cron/tick";

export async function tickAuthorized(store: Pick<StudioStore, "tickSecret">, given: string | null, env: Record<string, string | undefined> = process.env): Promise<boolean> {
  if (!given) return false;
  const stored = await store.tickSecret().catch(() => null);
  if (stored && sameSecret(given, stored)) return true;
  const cron = (env["CRON_SECRET"] ?? "").trim();
  return !!cron && sameSecret(given, cron);
}

/** Start (or restart, with a new secret) the tick at this address; a restart cuts off the old secret. */
export async function startClock(store: Pick<StudioStore, "startTick" | "logEvent">, baseUrl: string): Promise<{ url: string; message: string }> {
  const url = `${baseUrl.replace(/\/+$/, "")}${TICK_PATH}`;
  const message = await store.startTick(url, randomBytes(32).toString("base64url"));
  await store.logEvent({ table: "studio_settings", rowId: "clock", to: "started", actor: "owner", note: url });
  return { url, message };
}

export async function stopClock(store: Pick<StudioStore, "stopTick" | "logEvent">): Promise<{ message: string }> {
  const message = await store.stopTick();
  await store.logEvent({ table: "studio_settings", rowId: "clock", to: "stopped", actor: "owner" });
  return { message };
}
