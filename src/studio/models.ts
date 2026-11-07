/**
 * The models table and what a call costs. Every agent's model, effort, output budget and weekly cap
 * come from here by default and from the owner's settings when she changed them (Settings → Models,
 * or a node's drawer on the Map): nothing about a model is hardcoded anywhere else.
 */
import table from "./models.json";
import type { Effort } from "./types";
import { EFFORTS } from "./types";

export interface ModelInfo {
  readonly id: string;
  readonly label: string;
  readonly note: string;
  readonly context: number;
  readonly maxOutput: number;
  /** Dollars per million tokens. */
  readonly input: number;
  readonly output: number;
  readonly cacheWrite5m: number;
  readonly cacheWrite1h: number;
  readonly cacheRead: number;
  readonly batchFactor: number;
  readonly longInputAbove?: number;
  readonly longInput?: number;
  readonly longOutput?: number;
  readonly defaultEffort: Effort;
  readonly fallbacks: boolean;
}

type RawModel = Omit<ModelInfo, "id" | "defaultEffort"> & { defaultEffort: string };

export const MODELS_CHECKED: string = table.checked;

const RAW = table.models as Record<string, RawModel>;

export function modelTable(overrides: Readonly<Record<string, Partial<ModelInfo>>> = {}): ModelInfo[] {
  const ids = new Set([...Object.keys(RAW), ...Object.keys(overrides)]);
  const out: ModelInfo[] = [];
  for (const id of ids) {
    const base = RAW[id];
    const over = overrides[id] ?? {};
    if (!base && !over.label) continue;
    const effort = (over.defaultEffort ?? base?.defaultEffort ?? "medium") as Effort;
    out.push({
      id,
      label: over.label ?? base?.label ?? id,
      note: over.note ?? base?.note ?? "",
      context: over.context ?? base?.context ?? 200000,
      maxOutput: over.maxOutput ?? base?.maxOutput ?? 64000,
      input: over.input ?? base?.input ?? 0,
      output: over.output ?? base?.output ?? 0,
      cacheWrite5m: over.cacheWrite5m ?? base?.cacheWrite5m ?? 0,
      cacheWrite1h: over.cacheWrite1h ?? base?.cacheWrite1h ?? 0,
      cacheRead: over.cacheRead ?? base?.cacheRead ?? 0,
      batchFactor: over.batchFactor ?? base?.batchFactor ?? 0.5,
      longInputAbove: over.longInputAbove ?? base?.longInputAbove,
      longInput: over.longInput ?? base?.longInput,
      longOutput: over.longOutput ?? base?.longOutput,
      defaultEffort: (EFFORTS as readonly string[]).includes(effort) ? effort : "medium",
      fallbacks: over.fallbacks ?? base?.fallbacks ?? false,
    });
  }
  return out;
}

export function modelInfo(id: string, overrides: Readonly<Record<string, Partial<ModelInfo>>> = {}): ModelInfo | null {
  return modelTable(overrides).find((m) => m.id === id) ?? null;
}

export function isKnownModel(id: string): boolean {
  return id in RAW;
}

export interface Usage {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly cacheReadTokens: number;
  readonly cacheWriteTokens: number;
  /** True when the cache entries were written with the 1-hour time to live. */
  readonly cacheWrite1h?: boolean;
}

export const NO_USAGE: Usage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };

export function addUsage(a: Usage, b: Usage): Usage {
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    cacheReadTokens: a.cacheReadTokens + b.cacheReadTokens,
    cacheWriteTokens: a.cacheWriteTokens + b.cacheWriteTokens,
    cacheWrite1h: a.cacheWrite1h || b.cacheWrite1h,
  };
}

/**
 * Dollars for one call. Thinking tokens are output tokens and are billed as such (they are in
 * outputTokens). A batch call costs `batchFactor` of every line. An unknown model costs nothing here,
 * so the run row says 0 rather than inventing a price; the Models page flags it.
 */
/**
 * The owner's price corrections (Settings → Models), set once per run from studio_settings, so a price
 * change takes effect without a deploy and every cost in the run uses it.
 */
let priceOverrides: Readonly<Record<string, Partial<ModelInfo>>> = {};
export function setPriceOverrides(overrides: Readonly<Record<string, Partial<ModelInfo>>>): void {
  priceOverrides = overrides;
}
export function currentPriceOverrides(): Readonly<Record<string, Partial<ModelInfo>>> {
  return priceOverrides;
}

export function costOf(model: string, usage: Usage, options: { batch?: boolean; overrides?: Readonly<Record<string, Partial<ModelInfo>>> } = {}): number {
  const info = modelInfo(model, options.overrides ?? priceOverrides);
  if (!info) return 0;
  const promptTokens = usage.inputTokens + usage.cacheReadTokens + usage.cacheWriteTokens;
  const long = info.longInputAbove !== undefined && promptTokens > info.longInputAbove;
  const inputPrice = long && info.longInput !== undefined ? info.longInput : info.input;
  const outputPrice = long && info.longOutput !== undefined ? info.longOutput : info.output;
  const writePrice = usage.cacheWrite1h ? info.cacheWrite1h : info.cacheWrite5m;
  const dollars =
    (usage.inputTokens * inputPrice +
      usage.outputTokens * outputPrice +
      usage.cacheReadTokens * info.cacheRead +
      usage.cacheWriteTokens * writePrice) /
    1_000_000;
  return round6(options.batch ? dollars * info.batchFactor : dollars);
}

export function round6(n: number): number {
  return Math.round(n * 1_000_000) / 1_000_000;
}

/** Which agents and interactive uses exist, with their defaults (the build prompt's models section). */
export interface AgentModelDefaults {
  readonly model: string;
  readonly effort: Effort;
  readonly maxTokens: number;
  /** Dollars a week this use may spend; the global cap still applies on top. */
  readonly weeklyCapUsd: number;
  readonly fallbacks: boolean;
}

export const MODEL_USES = [
  "strategist",
  "writer-en",
  "writer-fr",
  "community-classify",
  "community-draft",
  "analyst",
  "rewrite",
  "test-prompt",
] as const;
export type ModelUse = (typeof MODEL_USES)[number];

export const MODEL_USE_LABELS: Readonly<Record<ModelUse, string>> = {
  strategist: "Strategist",
  "writer-en": "Writer EN",
  "writer-fr": "Writer FR",
  "community-classify": "Community: sorting",
  "community-draft": "Community: reply drafts",
  analyst: "Analyst",
  rewrite: "Rewrite a piece (interactive)",
  "test-prompt": "Test a prompt on one card",
};

/**
 * The defaults. Effort replaces the build prompt's temperatures (these models take no sampling
 * parameters): the strategist and the analyst think hard once a week, the writers at medium for
 * volume, the sorting at low. max_tokens leaves room for thinking, which these models always do.
 */
export const MODEL_DEFAULTS: Readonly<Record<ModelUse, AgentModelDefaults>> = {
  strategist: { model: "claude-opus-5-5", effort: "high", maxTokens: 32000, weeklyCapUsd: 2, fallbacks: true },
  "writer-en": { model: "claude-sonnet-5-5", effort: "medium", maxTokens: 8000, weeklyCapUsd: 3, fallbacks: true },
  "writer-fr": { model: "claude-sonnet-5-5", effort: "medium", maxTokens: 8000, weeklyCapUsd: 3, fallbacks: true },
  "community-classify": { model: "claude-haiku-5-5", effort: "low", maxTokens: 1024, weeklyCapUsd: 0.5, fallbacks: false },
  "community-draft": { model: "claude-sonnet-5-5", effort: "low", maxTokens: 2000, weeklyCapUsd: 2, fallbacks: true },
  analyst: { model: "claude-opus-5-5", effort: "high", maxTokens: 16000, weeklyCapUsd: 1, fallbacks: true },
  rewrite: { model: "claude-sonnet-5-5", effort: "medium", maxTokens: 8000, weeklyCapUsd: 1, fallbacks: true },
  "test-prompt": { model: "claude-sonnet-5-5", effort: "medium", maxTokens: 8000, weeklyCapUsd: 1, fallbacks: true },
};
