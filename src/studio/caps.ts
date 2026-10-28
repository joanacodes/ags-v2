/**
 * The caps are hard stops, read before every run: the week's model spend (all agents, and each use),
 * this month's ElevenLabs minutes, the renders of a night. Over a cap, the run writes a row saying so and
 * does nothing; at 80% a reminder tells the owner what will stop.
 */
import type { StudioStore } from "./store/store";
import type { StudioSettings } from "./settings";
import type { ModelUse } from "./models";
import { MODEL_USE_LABELS } from "./models";
import { monthStart, weekStart } from "./time";

export interface CapCheck {
  readonly ok: boolean;
  readonly spent: number;
  readonly cap: number;
  readonly reason: string | null;
  /** Between 0 and 1+, for the Map's health strip and the cap-near reminder. */
  readonly share: number;
}

/** The agent names runs are logged under, per model use. */
export const USE_AGENT: Readonly<Record<ModelUse, string>> = {
  strategist: "strategist",
  "writer-en": "writer-en",
  "writer-fr": "writer-fr",
  "community-classify": "community",
  "community-draft": "community",
  analyst: "analyst",
  rewrite: "interactive",
  "test-prompt": "interactive",
};

export async function modelCap(store: StudioStore, settings: StudioSettings, use: ModelUse, now: Date = new Date()): Promise<CapCheck> {
  const since = weekStart(now).toISOString();
  const globalCap = settings.get("global").weekly_cap_usd;
  const spentAll = await store.spendSince(since);
  if (spentAll >= globalCap) {
    return { ok: false, spent: spentAll, cap: globalCap, share: globalCap > 0 ? spentAll / globalCap : 1, reason: `the week's model spend ($${spentAll.toFixed(2)}) has reached the cap ($${globalCap.toFixed(2)})` };
  }
  const useCap = settings.model(use).weekly_cap_usd;
  const spentUse = await store.spendSince(since, USE_AGENT[use]);
  if (spentUse >= useCap) {
    return { ok: false, spent: spentUse, cap: useCap, share: useCap > 0 ? spentUse / useCap : 1, reason: `${MODEL_USE_LABELS[use]} has spent $${spentUse.toFixed(2)} this week, its cap is $${useCap.toFixed(2)}` };
  }
  return { ok: true, spent: spentAll, cap: globalCap, share: globalCap > 0 ? spentAll / globalCap : 0, reason: null };
}

export async function voiceCap(store: StudioStore, settings: StudioSettings, now: Date = new Date()): Promise<CapCheck> {
  const cap = settings.get("render-video").minutes_cap;
  const used = await store.ttsSince(monthStart(now).toISOString());
  const minutes = used.durationMs / 60000;
  return {
    ok: minutes < cap,
    spent: minutes,
    cap,
    share: cap > 0 ? minutes / cap : 1,
    reason: minutes >= cap ? `this month's voice minutes (${minutes.toFixed(1)}) have reached the cap (${cap})` : null,
  };
}
