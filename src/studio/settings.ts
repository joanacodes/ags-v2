/**
 * Every node's settings: the defaults in code, the owner's changes in studio_settings. A stored value
 * that no longer fits its field (a typo in a schedule, a model id that's gone) is ignored for that
 * field only, the default stands, and the Settings page says so: a bad edit never stops a run.
 */
import { z } from "zod/v4";
import { EFFORTS, PLATFORMS, REMINDER_KINDS, type Platform } from "./types";
import { MODEL_DEFAULTS, MODEL_USES, type AgentModelDefaults, type ModelUse } from "./models";
import { isValidCron } from "./schedule/cron";

const cron = z.string().refine(isValidCron, "not a schedule (five fields, Paris time)");
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

export const modelUseSchema = z.object({
  model: z.string().min(3),
  effort: z.enum(EFFORTS),
  max_tokens: z.number().int().min(256).max(128000),
  weekly_cap_usd: z.number().min(0).max(1000),
  fallbacks: z.boolean(),
});
export type ModelUseSettings = z.infer<typeof modelUseSchema>;

const reminderKindSchema = z.object({ on: z.boolean(), channels: z.array(z.enum(["in_app", "email", "push"])) });

/** One schema per node (or node family), each field with its default. */
export const SETTINGS_SCHEMAS = {
  global: z.object({
    paused: z.boolean().default(false),
    paused_reason: z.string().nullable().default(null),
    scheduling_mode: z.enum(["confirm", "direct"]).default("confirm"),
    weekly_cap_usd: z.number().min(0).max(1000).default(10),
    warmup_until: z.string().nullable().default("2026-11-08"),
    keyword_from: z.string().nullable().default("2026-11-11"),
    owner_email: z.string().nullable().default(null),
    branch: z.string().default("main"),
  }),
  models: z.object(
    Object.fromEntries(
      MODEL_USES.map((use) => {
        const d: AgentModelDefaults = MODEL_DEFAULTS[use];
        return [use, modelUseSchema.default({ model: d.model, effort: d.effort, max_tokens: d.maxTokens, weekly_cap_usd: d.weeklyCapUsd, fallbacks: d.fallbacks })];
      }),
    ) as Record<ModelUse, z.ZodDefault<typeof modelUseSchema>>,
  ),
  strategist: z.object({
    enabled: z.boolean().default(true),
    schedule: cron.default("0 6 * * 0"),
    prompt_version: z.number().int().positive().nullable().default(null),
    retry: z.enum(["none", "once"]).default("once"),
    cards_min: z.number().int().min(1).max(200).default(45),
    cards_max: z.number().int().min(1).max(200).default(60),
    backlog_max: z.number().int().min(0).max(50).default(5),
    similarity_max: z.number().min(0.5).max(1).default(0.85),
    window_days: z.number().int().min(1).max(30).default(10),
    write_after: z.boolean().default(true),
  }),
  "writer-en": z.object({
    enabled: z.boolean().default(true),
    prompt_version: z.number().int().positive().nullable().default(null),
    use_batches: z.boolean().default(true),
    batch_deadline: hhmm.default("07:30"),
  }),
  "writer-fr": z.object({
    enabled: z.boolean().default(true),
    prompt_version: z.number().int().positive().nullable().default(null),
    use_batches: z.boolean().default(true),
    batch_deadline: hhmm.default("07:30"),
  }),
  community: z.object({
    enabled: z.boolean().default(true),
    schedule: cron.default("0 8,18 * * *"),
    prompt_version: z.number().int().positive().nullable().default(null),
    items_max: z.number().int().min(1).max(500).default(60),
    platforms: z.array(z.enum(PLATFORMS)).default(["instagram", "facebook", "threads", "youtube", "bluesky", "mastodon"]),
  }),
  analyst: z.object({
    enabled: z.boolean().default(true),
    schedule: cron.default("0 7 * * 5"),
    prompt_version: z.number().int().positive().nullable().default(null),
  }),
  "input-study": z.object({
    weeks: z.number().int().min(1).max(12).default(1),
    // AGS's daily limit on tests (DAILY_LIMIT in its study flow): a day that reaches it counts towards
    // the "raise the cap" rule.
    daily_cap: z.number().int().min(1).max(10000).default(50),
  }),
  "input-site": z.object({
    enabled: z.boolean().default(true),
    schedule: cron.default("0 4 * * 0"),
    sky_schedule: cron.default("0 3 1 * *"),
    sky_days: z.number().int().min(14).max(366).default(120),
    sites: z
      .object({ astrostudy: z.boolean().default(true), "maison-tarot": z.boolean().default(false) })
      .default({ astrostudy: true, "maison-tarot": false }),
  }),
  "input-metrics": z.object({
    enabled: z.boolean().default(true),
    schedule: cron.default("30 0 * * *"),
    days_back: z.number().int().min(1).max(30).default(7),
    stripe: z.boolean().default(true),
    mailerlite: z.boolean().default(true),
  }),
  gate: z.object({
    checks: z
      .object({
        length: z.boolean().default(true),
        extras: z.boolean().default(true),
        statements: z.boolean().default(true),
        jargon: z.boolean().default(true),
        emoji: z.boolean().default(true),
        disclosure: z.boolean().default(true),
        figures: z.boolean().default(true),
        prediction: z.boolean().default(true),
        keyword: z.boolean().default(true),
        french: z.boolean().default(true),
        urls: z.boolean().default(true),
        nogo: z.boolean().default(true),
      })
      .default({ length: true, extras: true, statements: true, jargon: true, emoji: true, disclosure: true, figures: true, prediction: true, keyword: true, french: true, urls: true, nogo: true }),
  }),
  "render-video": z.object({
    enabled: z.boolean().default(true),
    schedule: cron.default("0 1 * * *"),
    voice_id: z.string().nullable().default(null),
    voice_model: z.string().default("eleven_multilingual_v2"),
    stability: z.number().min(0).max(1).default(0.6),
    similarity_boost: z.number().min(0).max(1).default(0.8),
    style: z.number().min(0).max(1).default(0.1),
    music: z.boolean().default(false),
    music_level_db: z.number().min(-40).max(0).default(-22),
    loudness_lufs: z.number().min(-24).max(-9).default(-14),
    max_seconds: z.number().int().min(10).max(180).default(45),
    minutes_cap: z.number().min(0).max(1000).default(30),
    default_template: z.string().default("meadow-text"),
    renders_per_night: z.number().int().min(1).max(100).default(20),
    background: z.string().default("meadow-loop-tall"),
    background_speed: z.number().min(0.25).max(2).default(0.8),
  }),
  "render-pictures": z.object({
    enabled: z.boolean().default(true),
    templates: z
      .object({ carousel: z.string().default("carousel"), pin: z.string().default("pin"), still: z.string().default("still"), story: z.string().default("story") })
      .default({ carousel: "carousel", pin: "pin", still: "still", story: "story" }),
  }),
  outbox: z.object({
    enabled: z.boolean().default(true),
    window_minutes: z.number().int().min(5).max(120).default(15),
    retry_after_minutes: z.number().int().min(5).max(1440).default(60),
    max_retries: z.number().int().min(0).max(5).default(1),
    video_gap_hours: z.number().min(0).max(24).default(4),
  }),
  platform: z.object({
    enabled: z.boolean().default(true),
    // How pieces leave: through the platform's API, through Postly (one key, public posts where the
    // owner's own app would be held private), by hand on Today, or (TikTok) to the app's inbox for the
    // owner to finish. Null means the platform's own default, below.
    mode: z.enum(["api", "postly", "by_hand", "inbox"]).nullable().default(null),
    slots: z.array(hhmm).nullable().default(null),
    max_per_day: z.number().int().min(0).max(50).nullable().default(null),
  }),
  // Postly: the workspace the Studio posts into and, per network, the channel (Settings → Connections).
  postly: z.object({
    workspace_id: z.string().nullable().default(null),
    workspace_name: z.string().nullable().default(null),
    channels: z.record(z.string(), z.object({ id: z.string(), name: z.string() })).default({}),
  }),
  library: z.object({
    media_days: z.number().int().min(7).max(3650).default(180),
    previews_days: z.number().int().min(1).max(365).default(30),
    replies_days: z.number().int().min(1).max(90).default(30),
  }),
  reminders: z.object({
    quiet_start: hhmm.default("22:00"),
    quiet_end: hhmm.default("07:00"),
    email: z.string().nullable().default(null),
    feed_token: z.string().nullable().default(null),
    kinds: z
      .object(Object.fromEntries(REMINDER_KINDS.map((k) => [k, reminderKindSchema.default({ on: k !== "sky-event", channels: k === "custom" || k === "agent" || k === "cap-near" || k === "connection-expiring" || k === "approve-week" || k === "scorecard" ? ["in_app", "email"] : ["in_app"] })])) as Record<(typeof REMINDER_KINDS)[number], z.ZodDefault<typeof reminderKindSchema>>)
      .prefault({}),
  }),
  maintenance: z.object({
    schedule: cron.default("15 3 * * *"),
  }),
} as const;

export type SettingsNode = keyof typeof SETTINGS_SCHEMAS;
export type NodeSettings<N extends SettingsNode> = z.infer<(typeof SETTINGS_SCHEMAS)[N]>;

/** Which schema a node id uses ("platform-threads" uses "platform"). */
export function schemaKeyFor(node: string): SettingsNode | null {
  if (node.startsWith("platform-")) return "platform";
  return node in SETTINGS_SCHEMAS ? (node as SettingsNode) : null;
}

export interface Resolved<T> {
  readonly value: T;
  /** Stored fields that were ignored, with why. */
  readonly ignored: string[];
}

function resolveWith<S extends z.ZodObject>(schema: S, stored: Record<string, unknown>): Resolved<z.infer<S>> {
  const ignored: string[] = [];
  const shape = schema.shape as Record<string, z.ZodType>;
  const merged: Record<string, unknown> = {};
  for (const [key, field] of Object.entries(shape)) {
    if (key in stored) {
      const candidate = field.safeParse(stored[key]);
      if (candidate.success) {
        merged[key] = candidate.data;
        continue;
      }
      ignored.push(`${key}: ${candidate.error.issues[0]?.message ?? "invalid"}`);
    }
    const fallback = field.safeParse(undefined);
    if (fallback.success) merged[key] = fallback.data;
  }
  for (const key of Object.keys(stored)) if (!(key in shape)) ignored.push(`${key}: not a setting of this node`);
  return { value: schema.parse(merged) as z.infer<S>, ignored };
}

export function resolveSettings<N extends SettingsNode>(node: N, stored: Record<string, unknown> | undefined): Resolved<NodeSettings<N>> {
  return resolveWith(SETTINGS_SCHEMAS[node] as unknown as z.ZodObject, stored ?? {}) as Resolved<NodeSettings<N>>;
}

export type PostingMode = "api" | "postly" | "by_hand" | "inbox";

/** The networks Postly can post to for the Studio (outbox/postly.ts holds the client). */
const POSTLY_READY: ReadonlySet<Platform> = new Set<Platform>(["instagram", "facebook", "threads", "tiktok", "youtube", "pinterest", "bluesky", "x"]);

/**
 * Where a platform starts before the owner changes anything: X off until there is a plan for its paid
 * API; TikTok by hand until its audit (the client exists behind this switch).
 */
const PLATFORM_DEFAULTS: Partial<Record<Platform, Record<string, unknown>>> = { x: { enabled: false }, tiktok: { mode: "by_hand" } };

/** All settings for a run, resolved once. */
export class StudioSettings {
  constructor(private readonly stored: Readonly<Record<string, Record<string, unknown>>>) {}

  get<N extends SettingsNode>(node: N): NodeSettings<N> {
    return resolveSettings(node, this.stored[node]).value;
  }

  platform(platform: Platform): NodeSettings<"platform"> {
    return resolveSettings("platform", { ...(PLATFORM_DEFAULTS[platform] ?? {}), ...(this.stored[`platform-${platform}`] ?? {}) }).value;
  }

  /** How a platform's pieces leave the Studio, after its defaults and the owner's choice. */
  postingMode(platform: Platform): PostingMode {
    if (platform === "substack" || platform === "medium" || platform === "site") return "by_hand";
    const mode = this.platform(platform).mode;
    if (mode === "postly" && POSTLY_READY.has(platform)) return "postly";
    if (platform === "tiktok") return mode === "api" || mode === "inbox" ? mode : "by_hand";
    return mode === "by_hand" ? "by_hand" : "api";
  }

  /** One model use, the owner's partial change laid over its defaults; an invalid result keeps the defaults. */
  model(use: ModelUse): ModelUseSettings {
    const d = MODEL_DEFAULTS[use];
    const defaults: ModelUseSettings = { model: d.model, effort: d.effort, max_tokens: d.maxTokens, weekly_cap_usd: d.weeklyCapUsd, fallbacks: d.fallbacks };
    const stored = (this.stored["models"] ?? {})[use];
    if (!stored || typeof stored !== "object") return defaults;
    const merged = modelUseSchema.safeParse({ ...defaults, ...(stored as Record<string, unknown>) });
    return merged.success ? merged.data : defaults;
  }

  raw(node: string): Record<string, unknown> {
    return this.stored[node] ?? {};
  }

  /** The problems with what's stored, per node, for the Settings page. */
  problems(): Record<string, string[]> {
    const out: Record<string, string[]> = {};
    for (const [node, stored] of Object.entries(this.stored)) {
      if (node === "models") {
        const bad: string[] = [];
        for (const [use, value] of Object.entries(stored)) {
          if (!(MODEL_USES as readonly string[]).includes(use)) bad.push(`${use}: not a model use`);
          else if (value && typeof value === "object") {
            const d = MODEL_DEFAULTS[use as ModelUse];
            const merged = modelUseSchema.safeParse({ model: d.model, effort: d.effort, max_tokens: d.maxTokens, weekly_cap_usd: d.weeklyCapUsd, fallbacks: d.fallbacks, ...(value as Record<string, unknown>) });
            if (!merged.success) bad.push(`${use}: ${merged.error.issues[0]?.path.join(".")} ${merged.error.issues[0]?.message}`);
          }
        }
        if (bad.length) out[node] = bad;
        continue;
      }
      const key = schemaKeyFor(node);
      if (!key) continue;
      const { ignored } = resolveWith(SETTINGS_SCHEMAS[key] as unknown as z.ZodObject, stored);
      if (ignored.length) out[node] = ignored;
    }
    return out;
  }
}
