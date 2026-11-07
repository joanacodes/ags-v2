/**
 * The rows of the Studio's tables (supabase/migrations/202610280001_studio.sql), as zod schemas.
 * Every row read from the database goes through these (ADR-0009: validate at the boundary), and a test
 * compares their columns with the migration's, so the two can't drift apart unnoticed.
 */
import { z } from "zod/v4";
import {
  CARD_LANGUAGES,
  CARD_STATUSES,
  FORMATS,
  LANGUAGES,
  PILLARS,
  PLATFORMS,
  POST_STATUSES,
  REMINDER_KINDS,
  REMINDER_STATUSES,
  REPEATS,
  REPLY_CLASSES,
  REPLY_FLAGS,
  REPLY_STATUSES,
  RUN_OUTCOMES,
  RUN_TRIGGERS,
} from "../types";

const ts = z.string();
const tsNull = z.string().nullable();
const num = z.coerce.number();
const numNull = z.union([z.null(), z.coerce.number()]);
const intNull = numNull;
const json = z.record(z.string(), z.unknown());

export const figureSchema = z.object({
  value: z.string().min(1),
  label: z.string().min(1),
  source: z.string().min(1),
  url: z.string().nullable().optional(),
  verified: z.boolean(),
});

export const slideSchema = z.object({ heading: z.string(), body: z.string() });

export const settingsRowSchema = z.object({
  node: z.string(),
  settings: json,
  updated_at: ts,
  updated_by: z.string(),
});
export type SettingsRow = z.infer<typeof settingsRowSchema>;

export const nodeRowSchema = z.object({
  node: z.string(),
  x: num,
  y: num,
  collapsed: z.boolean(),
  updated_at: ts,
});
export type NodeRow = z.infer<typeof nodeRowSchema>;

export const kitVersionRowSchema = z.object({
  version: num,
  yaml: z.string(),
  note: z.string().nullable(),
  created_at: ts,
  created_by: z.string(),
});
export type KitVersionRow = z.infer<typeof kitVersionRowSchema>;

export const promptRowSchema = z.object({
  agent: z.string(),
  version: num,
  text: z.string(),
  note: z.string().nullable(),
  created_at: ts,
  created_by: z.string(),
});
export type PromptRow = z.infer<typeof promptRowSchema>;

export const hookStatsSchema = z.object({
  uses: z.number().optional(),
  results: z.array(z.number()).optional(),
  best: z.number().optional(),
  median: z.number().optional(),
  last_used: z.string().optional(),
});
export type HookStats = z.infer<typeof hookStatsSchema>;

export const hookRowSchema = z.object({
  id: z.string(),
  text: z.string(),
  pillar: z.enum(PILLARS),
  language: z.enum(LANGUAGES),
  retired: z.boolean(),
  stats: hookStatsSchema.catch({}),
  source: z.string(),
  created_at: ts,
  updated_at: ts,
});
export type HookRow = z.infer<typeof hookRowSchema>;

export const cardRowSchema = z.object({
  id: z.string(),
  week: z.string(),
  pillar: z.enum(PILLARS),
  language: z.enum(CARD_LANGUAGES),
  idea: z.string(),
  hook: z.string(),
  points: z.array(z.string()).catch([]),
  figures: z.array(figureSchema).catch([]),
  cta: z.string(),
  anchor: z.string().nullable(),
  sky_date: z.string().nullable(),
  formats: z.array(z.enum(FORMATS)).catch([]),
  src: z.string().nullable(),
  kit_version: intNull,
  prompt_version: intNull,
  parent: z.string().nullable(),
  hook_id: z.string().nullable(),
  status: z.enum(CARD_STATUSES),
  reason: z.string().nullable(),
  run_id: z.string().nullable(),
  created_by: z.string(),
  approved_at: tsNull,
  approved_by: z.string().nullable(),
  updated_by: z.string(),
  created_at: ts,
  updated_at: ts,
});
export type CardRow = z.infer<typeof cardRowSchema>;

export const gateResultSchema = z.object({
  ok: z.boolean(),
  checked_at: z.string(),
  failures: z.array(z.object({ check: z.string(), message: z.string(), span: z.string().optional() })),
  warnings: z.array(z.object({ check: z.string(), message: z.string() })).default([]),
  media: z.boolean().optional(),
});
export type GateResult = z.infer<typeof gateResultSchema>;

export const postRowSchema = z.object({
  id: z.string(),
  card_id: z.string(),
  platform: z.enum(PLATFORMS),
  format: z.enum(FORMATS),
  language: z.enum(LANGUAGES),
  script: z.string().nullable(),
  lines: z.array(z.string()).nullable().catch(null),
  caption: z.string().nullable(),
  title: z.string().nullable(),
  description: z.string().nullable(),
  tags: z.array(z.string()).catch([]),
  slides: z.array(slideSchema).nullable().catch(null),
  spec: z.unknown().nullable(),
  disclosure: z.boolean(),
  scheduled_at: tsNull,
  status: z.enum(POST_STATUSES),
  gate: gateResultSchema.nullable().catch(null),
  by_hand: z.boolean(),
  platform_post_id: z.string().nullable(),
  platform_url: z.string().nullable(),
  platform_state: json.nullable().catch(null),
  posted_at: tsNull,
  error: z.string().nullable(),
  retries: num,
  approved_at: tsNull,
  approved_by: z.string().nullable(),
  confirmed_at: tsNull,
  run_id: z.string().nullable(),
  updated_by: z.string(),
  created_at: ts,
  updated_at: ts,
});
export type PostRow = z.infer<typeof postRowSchema>;

export const MEDIA_KINDS = ["video", "image", "audio", "srt", "thumbnail", "timeline"] as const;
export type MediaKind = (typeof MEDIA_KINDS)[number];

export const mediaRowSchema = z.object({
  id: z.string(),
  post_id: z.string().nullable(),
  kind: z.enum(MEDIA_KINDS),
  path: z.string(),
  bytes: num,
  duration_ms: intNull,
  width: intNull,
  height: intNull,
  sha256: z.string().nullable(),
  meta: json.catch({}),
  created_at: ts,
});
export type MediaRow = z.infer<typeof mediaRowSchema>;

export const metricRowSchema = z.object({
  post_id: z.string(),
  day: z.string(),
  views: intNull,
  likes: intNull,
  comments: intNull,
  shares: intNull,
  saves: intNull,
  link_taps: intNull,
  keyword_comments: intNull,
  source: z.string(),
  fetched_at: ts,
});
export type MetricRow = z.infer<typeof metricRowSchema>;

export const replyRowSchema = z.object({
  id: z.string(),
  platform: z.string(),
  thread_ref: z.string(),
  parent_ref: z.string().nullable(),
  post_id: z.string().nullable(),
  author_handle: z.string().nullable(),
  author_ref: z.string().nullable(),
  their_text: z.string(),
  their_lang: z.string().nullable(),
  received_at: ts,
  klass: z.enum(REPLY_CLASSES).nullable(),
  draft_reply: z.string().nullable(),
  flag: z.enum(REPLY_FLAGS),
  flag_reason: z.string().nullable(),
  status: z.enum(REPLY_STATUSES),
  sent_at: tsNull,
  sent_ref: z.string().nullable(),
  expires_at: ts,
  updated_by: z.string(),
  created_at: ts,
  updated_at: ts,
});
export type ReplyRow = z.infer<typeof replyRowSchema>;

export const runRowSchema = z.object({
  id: z.string(),
  agent: z.string(),
  trigger: z.enum(RUN_TRIGGERS),
  started_at: ts,
  finished_at: tsNull,
  model: z.string().nullable(),
  prompt_version: intNull,
  input_tokens: num,
  output_tokens: num,
  cache_read_tokens: num,
  cache_write_tokens: num,
  cost_usd: num,
  wrote: json.catch({}),
  outcome: z.enum(RUN_OUTCOMES),
  error: z.string().nullable(),
  log_url: z.string().nullable(),
  details: json.catch({}),
});
export type RunRow = z.infer<typeof runRowSchema>;

export const eventRowSchema = z.object({
  id: num,
  table_name: z.string(),
  row_id: z.string(),
  from_status: z.string().nullable(),
  to_status: z.string().nullable(),
  actor: z.string(),
  at: ts,
  note: z.string().nullable(),
});
export type EventRow = z.infer<typeof eventRowSchema>;

export const reminderRowSchema = z.object({
  id: z.string(),
  kind: z.enum(REMINDER_KINDS),
  title: z.string(),
  body: z.string().nullable(),
  due_at: ts,
  timezone: z.string(),
  repeat: z.enum(REPEATS),
  channels: z.array(z.string()).catch(["in_app"]),
  urgent: z.boolean(),
  linked_table: z.string().nullable(),
  linked_id: z.string().nullable(),
  link: z.string().nullable(),
  created_by: z.string(),
  status: z.enum(REMINDER_STATUSES),
  snoozed_until: tsNull,
  sent_at: tsNull,
  dedupe_key: z.string().nullable(),
  updated_by: z.string(),
  created_at: ts,
  updated_at: ts,
});
export type ReminderRow = z.infer<typeof reminderRowSchema>;

export const skyRowSchema = z.object({
  id: z.string(),
  date: z.string(),
  time_paris: z.string().nullable(),
  kind: z.enum(["ingress", "station", "lunation", "eclipse"]),
  body: z.string(),
  sign: z.string().nullable(),
  degree: numNull,
  event: z.string(),
  source1: z.string().nullable(),
  source2: z.string().nullable(),
  created_by: z.string(),
  created_at: ts,
});
export type SkyRow = z.infer<typeof skyRowSchema>;

export const calendarRowSchema = z.object({
  id: z.string(),
  date: z.string(),
  event: z.string(),
  note: z.string().nullable(),
  source: z.string(),
  remind: z.boolean(),
  created_at: ts,
});
export type CalendarRow = z.infer<typeof calendarRowSchema>;

export const connectionRowSchema = z.object({
  platform: z.string(),
  status: z.enum(["connected", "expiring", "expired", "disconnected"]),
  account_label: z.string().nullable(),
  account_ref: z.string().nullable(),
  scopes: z.array(z.string()).catch([]),
  expires_at: tsNull,
  vault_secret_id: z.string().nullable(),
  meta: json.catch({}),
  updated_at: ts,
});
export type ConnectionRow = z.infer<typeof connectionRowSchema>;

export const orderRowSchema = z.object({
  session_id: z.string(),
  created: ts,
  amount: num,
  currency: z.string().nullable(),
  client_reference_id: z.string().nullable(),
  product: z.string().nullable(),
  status: z.string().nullable(),
  fetched_at: ts,
});
export type OrderRow = z.infer<typeof orderRowSchema>;

export const templateRowSchema = z.object({
  id: z.string(),
  base: z.string(),
  name: z.string(),
  spec: json.catch({}),
  is_default: z.boolean(),
  created_at: ts,
});
export type TemplateRow = z.infer<typeof templateRowSchema>;

export const scorecardRowSchema = z.object({
  week: z.string(),
  figures: json,
  verdicts: z.array(z.unknown()).catch([]),
  suggestions: z.array(z.unknown()).catch([]),
  for_owner: z.array(z.unknown()).catch([]),
  cost_usd: num,
  run_id: z.string().nullable(),
  created_at: ts,
});
export type ScorecardRow = z.infer<typeof scorecardRowSchema>;

export const weeklyInputRowSchema = z.object({
  week: z.string(),
  owner_hours: numNull,
  dm_count: intNull,
  manual: json.catch({}),
  note: z.string().nullable(),
  updated_at: ts,
});
export type WeeklyInputRow = z.infer<typeof weeklyInputRowSchema>;

export const sourceRowSchema = z.object({
  id: z.string(),
  site: z.string(),
  language: z.enum(LANGUAGES),
  path: z.string(),
  url: z.string().nullable(),
  section: z.string().nullable(),
  title: z.string(),
  description: z.string().nullable(),
  updated_at: ts,
});
export type SourceRow = z.infer<typeof sourceRowSchema>;

export const ttsRowSchema = z.object({
  hash: z.string(),
  voice_id: z.string(),
  characters: num,
  duration_ms: num,
  path: z.string(),
  created_at: ts,
});
export type TtsRow = z.infer<typeof ttsRowSchema>;

/** The few columns of AGS's study_sessions the Studio reads (never names, emails or birth details). */
export const studySessionRowSchema = z.object({
  id: z.string(),
  language: z.string(),
  source: z.string().nullable(),
  status: z.string(),
  total: num,
  answered: num,
  recognised: num,
  news_consent_at: tsNull,
  birth_time_known: z.boolean(),
  created_at: ts,
  finished_at: tsNull,
});
export type StudySessionRow = z.infer<typeof studySessionRowSchema>;
export const STUDY_SESSION_COLUMNS = "id,language,source,status,total,answered,recognised,news_consent_at,birth_time_known,created_at,finished_at";

/** Table name → schema, for the drift test and for exports. */
export const TABLE_SCHEMAS = {
  studio_settings: settingsRowSchema,
  studio_nodes: nodeRowSchema,
  studio_kit_versions: kitVersionRowSchema,
  studio_prompts: promptRowSchema,
  studio_hooks: hookRowSchema,
  studio_cards: cardRowSchema,
  studio_posts: postRowSchema,
  studio_media: mediaRowSchema,
  studio_metrics: metricRowSchema,
  studio_replies: replyRowSchema,
  studio_runs: runRowSchema,
  studio_events: eventRowSchema,
  studio_reminders: reminderRowSchema,
  studio_sky: skyRowSchema,
  studio_calendar: calendarRowSchema,
  studio_connections: connectionRowSchema,
  studio_orders: orderRowSchema,
  studio_templates: templateRowSchema,
  studio_scorecards: scorecardRowSchema,
  studio_weekly_inputs: weeklyInputRowSchema,
  studio_sources: sourceRowSchema,
  studio_tts: ttsRowSchema,
} as const;
