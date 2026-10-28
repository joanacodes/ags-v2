/**
 * Everything the Studio reads and writes, as one interface. The Supabase implementation
 * (src/server/studio-store.ts) is what runs; the in-memory one (memory.ts) runs the agents and the
 * flows in tests and local dry runs. Writes always say who or what made them (`actor`), which the
 * audit trigger records with every change of status.
 */
import type {
  CalendarRow,
  CardRow,
  ConnectionRow,
  EventRow,
  HookRow,
  KitVersionRow,
  MediaRow,
  MetricRow,
  NodeRow,
  OrderRow,
  PostRow,
  PromptRow,
  ReminderRow,
  ReplyRow,
  RunRow,
  ScorecardRow,
  SkyRow,
  SourceRow,
  StudySessionRow,
  TemplateRow,
  TtsRow,
  WeeklyInputRow,
} from "./rows";
import type { CardStatus, Format, Language, Pillar, Platform, PostStatus, ReminderStatus, ReplyStatus, RunOutcome, RunTrigger } from "../types";
import type { Usage } from "../models";

export type NewCard = Pick<CardRow, "week" | "pillar" | "language" | "idea" | "hook" | "points" | "figures" | "cta" | "formats"> &
  Partial<Pick<CardRow, "anchor" | "sky_date" | "src" | "kit_version" | "prompt_version" | "parent" | "hook_id" | "status" | "reason" | "run_id" | "created_by">>;

export type NewPost = Pick<PostRow, "card_id" | "platform" | "format" | "language"> &
  Partial<
    Pick<
      PostRow,
      | "script"
      | "lines"
      | "caption"
      | "title"
      | "description"
      | "tags"
      | "slides"
      | "spec"
      | "disclosure"
      | "scheduled_at"
      | "status"
      | "gate"
      | "by_hand"
      | "run_id"
      | "updated_by"
    >
  >;

export type NewMedia = Omit<MediaRow, "id" | "created_at">;
export type NewReply = Pick<ReplyRow, "platform" | "thread_ref" | "their_text" | "received_at"> &
  Partial<Pick<ReplyRow, "parent_ref" | "post_id" | "author_handle" | "author_ref" | "their_lang">>;
export type NewReminder = Pick<ReminderRow, "kind" | "title" | "due_at"> &
  Partial<Pick<ReminderRow, "body" | "timezone" | "repeat" | "channels" | "urgent" | "linked_table" | "linked_id" | "link" | "created_by" | "dedupe_key">>;
export type NewSky = Omit<SkyRow, "id" | "created_at">;
export type NewCalendar = Omit<CalendarRow, "id" | "created_at">;
export type NewSource = Omit<SourceRow, "id" | "updated_at">;

export type CardPatch = Partial<Omit<CardRow, "id" | "created_at" | "updated_at" | "updated_by">>;
export type PostPatch = Partial<Omit<PostRow, "id" | "card_id" | "created_at" | "updated_at" | "updated_by">>;
export type ReplyPatch = Partial<Omit<ReplyRow, "id" | "platform" | "thread_ref" | "created_at" | "updated_at" | "updated_by">>;
export type ReminderPatch = Partial<Omit<ReminderRow, "id" | "created_at" | "updated_at" | "updated_by">>;

export interface CardFilter {
  readonly ids?: readonly string[];
  readonly weeks?: readonly string[];
  readonly statuses?: readonly CardStatus[];
  readonly pillar?: Pillar;
  readonly language?: string;
  readonly parent?: string;
  readonly createdSince?: string;
  readonly limit?: number;
}

export interface PostFilter {
  readonly ids?: readonly string[];
  readonly cardIds?: readonly string[];
  readonly statuses?: readonly PostStatus[];
  readonly platforms?: readonly Platform[];
  readonly formats?: readonly Format[];
  readonly language?: Language;
  readonly scheduledFrom?: string;
  readonly scheduledTo?: string;
  readonly postedFrom?: string;
  readonly byHand?: boolean;
  readonly limit?: number;
}

export interface ReplyFilter {
  readonly ids?: readonly string[];
  readonly statuses?: readonly ReplyStatus[];
  readonly flagged?: boolean;
  readonly since?: string;
  readonly authorRef?: string;
  readonly platform?: string;
  readonly limit?: number;
}

export interface ReminderFilter {
  readonly statuses?: readonly ReminderStatus[];
  readonly dueBefore?: string;
  readonly dueAfter?: string;
  readonly createdBy?: string;
  readonly createdSince?: string;
  readonly limit?: number;
}

export interface RunFilter {
  readonly agent?: string;
  readonly since?: string;
  readonly outcome?: RunOutcome;
  readonly limit?: number;
}

export interface RunStart {
  readonly agent: string;
  readonly trigger: RunTrigger;
  readonly model?: string | null;
  readonly promptVersion?: number | null;
  readonly details?: Record<string, unknown>;
}

export interface RunFinish {
  readonly outcome: RunOutcome;
  readonly usage?: Usage;
  readonly costUsd?: number;
  readonly model?: string | null;
  readonly wrote?: Record<string, unknown>;
  readonly error?: string | null;
  readonly logUrl?: string | null;
  readonly details?: Record<string, unknown>;
}

export interface StudioStore {
  // Settings and the Map
  allSettings(): Promise<Record<string, Record<string, unknown>>>;
  putSettings(node: string, settings: Record<string, unknown>, actor: string): Promise<void>;
  nodePositions(): Promise<NodeRow[]>;
  putNodePosition(node: string, x: number, y: number, collapsed: boolean): Promise<void>;
  resetNodePositions(): Promise<void>;

  // The kit and the prompts
  latestKit(): Promise<KitVersionRow | null>;
  kitVersions(limit?: number): Promise<KitVersionRow[]>;
  saveKit(yaml: string, note: string | null, actor: string): Promise<number>;
  latestPrompt(agent: string): Promise<PromptRow | null>;
  prompt(agent: string, version: number): Promise<PromptRow | null>;
  prompts(agent?: string): Promise<PromptRow[]>;
  savePrompt(agent: string, text: string, note: string | null, actor: string): Promise<number>;

  // Hooks
  hooks(filter?: { language?: Language; pillar?: Pillar; retired?: boolean }): Promise<HookRow[]>;
  addHooks(rows: { text: string; pillar: Pillar; language: Language; source: string }[]): Promise<number>;
  updateHook(id: string, patch: Partial<Pick<HookRow, "text" | "pillar" | "retired" | "stats">>): Promise<void>;

  // Cards and pieces
  insertCards(cards: readonly NewCard[], actor: string): Promise<CardRow[]>;
  cards(filter: CardFilter): Promise<CardRow[]>;
  updateCards(ids: readonly string[], patch: CardPatch, actor: string): Promise<void>;
  insertPosts(posts: readonly NewPost[], actor: string): Promise<PostRow[]>;
  posts(filter: PostFilter): Promise<PostRow[]>;
  updatePosts(ids: readonly string[], patch: PostPatch, actor: string): Promise<void>;

  // Media, metrics, orders
  insertMedia(media: NewMedia): Promise<MediaRow>;
  media(filter: { ids?: readonly string[]; postIds?: readonly string[]; kinds?: readonly string[]; limit?: number }): Promise<MediaRow[]>;
  deleteMedia(ids: readonly string[]): Promise<void>;
  upsertMetrics(rows: readonly Omit<MetricRow, "fetched_at">[]): Promise<void>;
  metrics(filter: { from: string; to: string; postIds?: readonly string[] }): Promise<MetricRow[]>;
  upsertOrders(rows: readonly Omit<OrderRow, "fetched_at">[]): Promise<void>;
  orders(filter: { from: string; to: string }): Promise<OrderRow[]>;

  // Replies
  insertReplies(rows: readonly NewReply[]): Promise<ReplyRow[]>;
  replies(filter: ReplyFilter): Promise<ReplyRow[]>;
  updateReply(id: string, patch: ReplyPatch, actor: string): Promise<void>;
  deleteExpiredReplies(now: string): Promise<number>;

  // Runs and the audit trail
  startRun(start: RunStart): Promise<RunRow>;
  finishRun(id: string, finish: RunFinish): Promise<void>;
  runs(filter: RunFilter): Promise<RunRow[]>;
  /** Prune one agent's old rows (the tick writes one every 15 minutes). */
  deleteRuns(filter: { agent: string; before: string }): Promise<number>;
  spendSince(since: string, agent?: string): Promise<number>;
  events(filter: { table?: string; rowId?: string; since?: string; limit?: number }): Promise<EventRow[]>;
  logEvent(event: { table: string; rowId: string; from?: string | null; to?: string | null; actor: string; note?: string | null }): Promise<void>;

  // Reminders
  insertReminder(reminder: NewReminder): Promise<ReminderRow | null>;
  reminders(filter: ReminderFilter): Promise<ReminderRow[]>;
  updateReminder(id: string, patch: ReminderPatch, actor: string): Promise<void>;

  // Sky, calendar, sources
  sky(filter: { from: string; to: string }): Promise<SkyRow[]>;
  upsertSky(rows: readonly NewSky[]): Promise<number>;
  deleteSky(id: string): Promise<void>;
  calendar(filter: { from: string; to: string }): Promise<CalendarRow[]>;
  upsertCalendar(rows: readonly NewCalendar[]): Promise<number>;
  deleteCalendar(id: string): Promise<void>;
  upsertSources(rows: readonly NewSource[]): Promise<number>;
  sources(filter: { sites?: readonly string[]; language?: Language; limit?: number }): Promise<SourceRow[]>;

  // Connections (the tokens themselves are in the vault, below)
  connections(): Promise<ConnectionRow[]>;
  upsertConnection(row: Omit<ConnectionRow, "updated_at">): Promise<void>;
  putSecret(name: string, value: string): Promise<string>;
  secret(name: string): Promise<string | null>;
  deleteSecret(name: string): Promise<void>;

  // Presets, scorecards, the owner's Friday inputs
  templates(): Promise<TemplateRow[]>;
  saveTemplate(row: Omit<TemplateRow, "id" | "created_at"> & { id?: string }): Promise<TemplateRow>;
  deleteTemplate(id: string): Promise<void>;
  scorecard(week: string): Promise<ScorecardRow | null>;
  scorecards(limit: number): Promise<ScorecardRow[]>;
  putScorecard(row: Omit<ScorecardRow, "created_at">): Promise<void>;
  weeklyInputs(week: string): Promise<WeeklyInputRow | null>;
  putWeeklyInputs(row: Omit<WeeklyInputRow, "updated_at">): Promise<void>;

  // Text-to-speech cache and the minutes it used
  tts(hash: string): Promise<TtsRow | null>;
  putTts(row: Omit<TtsRow, "created_at">): Promise<void>;
  ttsSince(since: string): Promise<{ characters: number; durationMs: number }>;

  // AGS's Study data (read only)
  studySessions(filter: { from: string; to: string }): Promise<StudySessionRow[]>;
}

/** Media files: Supabase Storage in production, a folder on disk in local runs. */
export interface MediaStorage {
  upload(path: string, bytes: Uint8Array, contentType: string): Promise<void>;
  download(path: string): Promise<Uint8Array>;
  signedUrl(path: string, seconds: number): Promise<string>;
  remove(paths: readonly string[]): Promise<void>;
  exists(path: string): Promise<boolean>;
  /** The files directly under a folder, with when each was made. */
  list(prefix: string): Promise<{ path: string; createdAt: string | null }[]>;
}
