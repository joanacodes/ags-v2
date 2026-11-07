/**
 * What every agent run is given: the store, the model transport, the kit in force, the settings, the
 * clock. Built once per run by the worker (or the interactive route) and passed down, so an agent never
 * reaches for the environment itself and a test can hand it a memory store and a fake model.
 */
import type { StudioStore, MediaStorage } from "../store/store";
import type { ModelTransport } from "../claude/transport";
import type { Kit } from "../kit/schema";
import { defaultKit, parseKit } from "../kit/load";
import { StudioSettings } from "../settings";
import type { RunTrigger } from "../types";
import { PROMPTS_V1, type PromptAgent } from "../prompts/texts";

export interface AgentContext {
  readonly store: StudioStore;
  readonly storage: MediaStorage;
  readonly transport: ModelTransport | null;
  readonly kit: Kit;
  readonly kitVersion: number;
  readonly settings: StudioSettings;
  readonly now: Date;
  readonly trigger: RunTrigger;
  /** The owner's Supabase user id: approvals carry it, and the outbox checks it. */
  readonly ownerId: string | null;
  /** True unless STUDIO_LIVE is "true": every outbox call is then a dry run that logs what it would send. */
  readonly dryRun: boolean;
}

/** The kit in force: the owner's latest saved version, or version 1 from the repository. */
export async function loadKit(store: StudioStore): Promise<{ kit: Kit; version: number; problems: string[] }> {
  const latest = await store.latestKit();
  if (latest) {
    const parsed = parseKit(latest.yaml);
    if (parsed.ok) return { kit: parsed.kit, version: latest.version, problems: [] };
    // A saved kit is validated before it is saved, so this only happens if the schema moved on since:
    // run on the repository's kit and say so rather than stop the week.
    return { kit: defaultKit(), version: 1, problems: parsed.problems.map((p) => `${p.path}: ${p.message}`) };
  }
  return { kit: defaultKit(), version: 1, problems: [] };
}

export async function loadSettings(store: StudioStore): Promise<StudioSettings> {
  return new StudioSettings(await store.allSettings());
}

/** The prompt a run uses: the version its settings pin, else the latest saved, else version 1. */
export async function promptFor(store: StudioStore, agent: PromptAgent, pinned: number | null): Promise<{ text: string; version: number }> {
  if (pinned !== null && pinned > 1) {
    const row = await store.prompt(agent, pinned);
    if (row) return { text: row.text, version: row.version };
  }
  if (pinned === 1) return { text: PROMPTS_V1[agent], version: 1 };
  const latest = await store.latestPrompt(agent);
  if (latest) return { text: latest.text, version: latest.version };
  return { text: PROMPTS_V1[agent], version: 1 };
}

export function isLive(): boolean {
  return (process.env.STUDIO_LIVE ?? "").trim().toLowerCase() === "true";
}
