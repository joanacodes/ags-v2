/**
 * The owner's controls over the Studio itself: a node's settings (validated before they are stored, so a
 * run never meets a value it can't use), the brand kit's new version, the kill switch and the restart.
 */
import type { AgentContext } from "../agents/context";
import type { SendEmail } from "../clients/resend";
import { parseKit, type KitProblem } from "../kit/load";
import { MODEL_DEFAULTS, MODEL_USES, type ModelUse } from "../models";
import { ownerEmail } from "../reminders/deliver";
import { cancelRunning, setWorkflowsEnabled, type GitHubEnv } from "../schedule/github";
import { modelUseSchema, schemaKeyFor, SETTINGS_SCHEMAS } from "../settings";
import { ActionError } from "./actions";

export interface SaveResult {
  readonly ok: boolean;
  readonly problems: readonly string[];
}

const PRICE_FIELDS = ["input", "output", "cacheWrite5m", "cacheWrite1h", "cacheRead", "batchFactor"] as const;

/** The stored price corrections, kept only where each is a sane number of dollars per million tokens. */
export function pricesFrom(stored: Record<string, unknown>): Record<string, Partial<Record<(typeof PRICE_FIELDS)[number], number>>> {
  const out: Record<string, Partial<Record<(typeof PRICE_FIELDS)[number], number>>> = {};
  for (const [model, value] of Object.entries(stored)) {
    if (!value || typeof value !== "object") continue;
    const fields: Partial<Record<(typeof PRICE_FIELDS)[number], number>> = {};
    for (const f of PRICE_FIELDS) {
      const v = (value as Record<string, unknown>)[f];
      if (typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 1000) fields[f] = v;
    }
    if (Object.keys(fields).length) out[model] = fields;
  }
  return out;
}

/** Store the owner's change to one node, merged over what was stored, only if the whole is valid. */
export async function saveNodeSettings(ctx: AgentContext, node: string, values: Record<string, unknown>): Promise<SaveResult> {
  const stored = ctx.settings.raw(node);
  if (node === "models") {
    const problems: string[] = [];
    const next: Record<string, unknown> = { ...stored };
    for (const [use, value] of Object.entries(values)) {
      if (!(MODEL_USES as readonly string[]).includes(use)) {
        problems.push(`${use}: not a model use`);
        continue;
      }
      const d = MODEL_DEFAULTS[use as ModelUse];
      const merged = { ...((stored[use] as Record<string, unknown>) ?? {}), ...((value as Record<string, unknown>) ?? {}) };
      const check = modelUseSchema.safeParse({ model: d.model, effort: d.effort, max_tokens: d.maxTokens, weekly_cap_usd: d.weeklyCapUsd, fallbacks: d.fallbacks, ...merged });
      if (!check.success) problems.push(...check.error.issues.map((i) => `${use}.${i.path.join(".")}: ${i.message}`));
      else next[use] = merged;
    }
    if (problems.length) return { ok: false, problems };
    await ctx.store.putSettings("models", next, "owner");
    return { ok: true, problems: [] };
  }
  if (node === "prices") {
    const clean = pricesFrom(values);
    const rejected = Object.keys(values).filter((m) => !clean[m]);
    if (rejected.length) return { ok: false, problems: rejected.map((m) => `${m}: prices are dollars per million tokens, between 0 and 1000`) };
    await ctx.store.putSettings("prices", { ...stored, ...clean }, "owner");
    return { ok: true, problems: [] };
  }
  const key = schemaKeyFor(node);
  if (!key) throw new ActionError(`${node} has no settings`, 404);
  const merged = { ...stored, ...values };
  const check = (SETTINGS_SCHEMAS[key] as unknown as { safeParse(v: unknown): { success: boolean; error?: { issues: { path: PropertyKey[]; message: string }[] } } }).safeParse(merged);
  if (!check.success) return { ok: false, problems: (check.error?.issues ?? []).map((i) => `${i.path.map(String).join(".") || node}: ${i.message}`) };
  await ctx.store.putSettings(node, merged, "owner");
  return { ok: true, problems: [] };
}

/** A new version of the kit, if it parses and lints clean; every card records the version it used. */
export async function saveKit(ctx: AgentContext, yaml: string, note: string | null): Promise<{ ok: boolean; version: number | null; problems: readonly KitProblem[] }> {
  const parsed = parseKit(yaml);
  if (!parsed.ok) return { ok: false, version: null, problems: parsed.problems };
  const version = await ctx.store.saveKit(yaml, note, "owner");
  return { ok: true, version, problems: parsed.problems };
}

export interface KillResult {
  readonly killed: number;
  readonly cancelled: number;
  readonly notes: readonly string[];
}

/**
 * Everything stops: the Studio is paused (no worker runs, the tick dispatches nothing, the outbox posts
 * nothing), every queued piece is killed, the workflows are disabled and what runs is cancelled, and the
 * owner gets an email saying what stopped. Approved pieces stay approved, so a restart doesn't mean
 * approving the week again; their slots that pass while paused are not posted late.
 */
export async function killSwitch(ctx: AgentContext, deps: { github: GitHubEnv | null; sendEmail: SendEmail | null }, reason: string): Promise<KillResult> {
  const notes: string[] = [];
  await ctx.store.putSettings("global", { ...ctx.settings.raw("global"), paused: true, paused_reason: reason.slice(0, 300) || "kill switch" }, "owner");
  const queued = await ctx.store.posts({ statuses: ["queued"], limit: 2000 });
  if (queued.length) await ctx.store.updatePosts(queued.map((p) => p.id), { status: "killed" }, "owner");
  let cancelled = 0;
  if (deps.github) {
    try {
      await setWorkflowsEnabled(deps.github, false);
      cancelled = await cancelRunning(deps.github);
    } catch (err) {
      notes.push(`GitHub: ${err instanceof Error ? err.message : String(err)}`);
    }
  } else notes.push("GITHUB_STUDIO_TOKEN isn't set: the workflows weren't disabled (the pause still stops every run)");
  await ctx.store.logEvent({ table: "studio_settings", rowId: "global", from: "running", to: "paused", actor: "owner", note: `kill switch: ${reason || "no reason given"}; ${queued.length} queued pieces killed; ${cancelled} runs cancelled` });
  const to = ownerEmail(ctx);
  if (deps.sendEmail && to) {
    await deps
      .sendEmail({ to, subject: "The Studio is stopped", text: `You pressed the kill switch${reason ? ` (${reason})` : ""}.\n\n${queued.length} queued pieces were killed, ${cancelled} runs cancelled, and every worker is paused. Nothing posts until you press Restart in Settings.` })
      .catch((err: unknown) => notes.push(`email: ${err instanceof Error ? err.message : String(err)}`));
  }
  return { killed: queued.length, cancelled, notes };
}

export async function restart(ctx: AgentContext, deps: { github: GitHubEnv | null }): Promise<{ notes: readonly string[] }> {
  const notes: string[] = [];
  await ctx.store.putSettings("global", { ...ctx.settings.raw("global"), paused: false, paused_reason: null }, "owner");
  if (deps.github) {
    try {
      await setWorkflowsEnabled(deps.github, true);
    } catch (err) {
      notes.push(`GitHub: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  await ctx.store.logEvent({ table: "studio_settings", rowId: "global", from: "paused", to: "running", actor: "owner", note: "restarted" });
  return { notes };
}
