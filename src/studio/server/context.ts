/**
 * The context a worker or a route runs with, from the environment: Supabase's store and Storage (or, for
 * a local dry run with STUDIO_LOCAL_DIR and no Supabase, the in-memory store and a folder on disk), the
 * model transport, the kit and settings in force, the owner's id, and whether the outbox is live.
 */
import { isLive, loadKit, loadSettings, type AgentContext } from "../agents/context";
import { transportFromEnv } from "../claude/sdk-transport";
import { pricesFrom } from "../views/control";
import { setPriceOverrides } from "../models";
import { MemoryStore } from "../store/memory";
import type { RunTrigger } from "../types";
import { LocalMediaStorage } from "./local-storage";
import { seedDemo } from "./demo";
import { FakeTransport } from "../claude/fake-transport";
import { hydrateKeys } from "../keys";
import { serviceClientFromEnv, SupabaseMediaStorage, SupabaseStudioStore } from "./studio-store";

export class ContextError extends Error {}

export async function contextFromEnv(trigger: RunTrigger, now: Date = new Date()): Promise<AgentContext> {
  const { client, missing } = serviceClientFromEnv();
  const localDir = (process.env.STUDIO_LOCAL_DIR ?? "").trim();
  let store;
  let storage;
  if (client) {
    store = new SupabaseStudioStore(client);
    storage = new SupabaseMediaStorage(client);
  } else if (localDir) {
    // One store for the life of the process, so a local run keeps what the screens change.
    const local = (globalThis as { __studioLocal?: { store: MemoryStore; storage: LocalMediaStorage; seeded: Promise<void> | null } }).__studioLocal ??= { store: new MemoryStore(), storage: new LocalMediaStorage(localDir), seeded: null };
    store = local.store;
    storage = local.storage;
    if (process.env.STUDIO_DEMO === "1" && process.env.NODE_ENV !== "production") {
      local.seeded ??= (async () => {
        const kit = await loadKit(store);
        const settings = await loadSettings(store);
        const ownerId = (process.env.STUDY_OWNER_USER_ID ?? "").trim() || "dev-owner";
        await seedDemo({ store, storage, transport: new FakeTransport(), kit: kit.kit, kitVersion: kit.version, settings, now, trigger: "manual", ownerId, dryRun: true }, ownerId);
      })();
      await local.seeded;
    }
  } else throw new ContextError(`${missing}: set it, or STUDIO_LOCAL_DIR for a local dry run`);
  // The keys pasted in Settings → Keys, into this process's environment before anything reads it.
  await hydrateKeys(store);
  const { kit, version } = await loadKit(store);
  const settings = await loadSettings(store);
  setPriceOverrides(pricesFrom(settings.raw("prices")));
  return {
    store,
    storage,
    // STUDIO_FAKE_MODEL=1: the stand-in model, for a dry run end to end without a key (never in production).
    transport: process.env.STUDIO_FAKE_MODEL === "1" && process.env.NODE_ENV !== "production" ? new FakeTransport() : transportFromEnv().transport,
    kit,
    kitVersion: version,
    settings,
    now,
    trigger,
    ownerId: (process.env.STUDY_OWNER_USER_ID ?? "").trim() || null,
    dryRun: !isLive(),
  };
}
