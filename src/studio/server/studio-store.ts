/**
 * The Studio's tables in Supabase (supabase/migrations/202610280001_studio.sql), through the secret key.
 *
 * Used by the server's routes (after the owner check) and by the workers on GitHub Actions. Every row
 * read back is checked against its schema (ADR-0009); a row that doesn't match is an error that names
 * the table, never silently skipped. No Next.js import here: the workers load this file too.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod/v4";
import {
  calendarRowSchema,
  cardRowSchema,
  connectionRowSchema,
  eventRowSchema,
  hookRowSchema,
  kitVersionRowSchema,
  mediaRowSchema,
  metricRowSchema,
  nodeRowSchema,
  orderRowSchema,
  postRowSchema,
  promptRowSchema,
  reminderRowSchema,
  replyRowSchema,
  runRowSchema,
  scorecardRowSchema,
  settingsRowSchema,
  skyRowSchema,
  sourceRowSchema,
  STUDY_SESSION_COLUMNS,
  studySessionRowSchema,
  templateRowSchema,
  ttsRowSchema,
  weeklyInputRowSchema,
  type ConnectionRow,
  type HookRow,
  type MetricRow,
  type OrderRow,
  type ScorecardRow,
  type TemplateRow,
  type TtsRow,
  type WeeklyInputRow,
} from "../store/rows";
import type {
  CardFilter,
  CardPatch,
  MediaStorage,
  NewCalendar,
  NewCard,
  NewMedia,
  NewPost,
  NewReminder,
  NewReply,
  NewSky,
  NewSource,
  PostFilter,
  PostPatch,
  ReminderFilter,
  ReminderPatch,
  ReplyFilter,
  ReplyPatch,
  RunFilter,
  RunFinish,
  RunStart,
  StudioStore,
} from "../store/store";
import type { Language, Pillar } from "../types";

export class StudioStorageError extends Error {}

function fail(table: string, error: { message: string } | null): never {
  throw new StudioStorageError(`${table}: ${error?.message ?? "unknown error"}`);
}

function rows<T>(table: string, schema: z.ZodType<T>, data: unknown): T[] {
  if (!Array.isArray(data)) return [];
  return data.map((row, i) => {
    const parsed = schema.safeParse(row);
    if (!parsed.success) {
      throw new StudioStorageError(`${table}: row ${i} doesn't match its schema: ${parsed.error.issues[0]?.path.join(".")} ${parsed.error.issues[0]?.message}`);
    }
    return parsed.data;
  });
}

function one<T>(table: string, schema: z.ZodType<T>, data: unknown): T | null {
  if (data === null || data === undefined) return null;
  return rows(table, schema, [data])[0] ?? null;
}

const nowIso = () => new Date().toISOString();

export class SupabaseStudioStore implements StudioStore {
  constructor(readonly client: SupabaseClient) {}

  async allSettings() {
    const { data, error } = await this.client.from("studio_settings").select("*");
    if (error) fail("studio_settings", error);
    const out: Record<string, Record<string, unknown>> = {};
    for (const row of rows("studio_settings", settingsRowSchema, data)) out[row.node] = row.settings;
    return out;
  }
  async putSettings(node: string, settings: Record<string, unknown>, actor: string) {
    const { error } = await this.client.from("studio_settings").upsert({ node, settings, updated_at: nowIso(), updated_by: actor });
    if (error) fail("studio_settings", error);
  }
  async nodePositions() {
    const { data, error } = await this.client.from("studio_nodes").select("*");
    if (error) fail("studio_nodes", error);
    return rows("studio_nodes", nodeRowSchema, data);
  }
  async putNodePosition(node: string, x: number, y: number, collapsed: boolean) {
    const { error } = await this.client.from("studio_nodes").upsert({ node, x, y, collapsed, updated_at: nowIso() });
    if (error) fail("studio_nodes", error);
  }
  async resetNodePositions() {
    const { error } = await this.client.from("studio_nodes").delete().neq("node", "");
    if (error) fail("studio_nodes", error);
  }

  async latestKit() {
    const { data, error } = await this.client.from("studio_kit_versions").select("*").order("version", { ascending: false }).limit(1).maybeSingle();
    if (error) fail("studio_kit_versions", error);
    return one("studio_kit_versions", kitVersionRowSchema, data);
  }
  async kitVersions(limit = 50) {
    const { data, error } = await this.client.from("studio_kit_versions").select("*").order("version", { ascending: false }).limit(limit);
    if (error) fail("studio_kit_versions", error);
    return rows("studio_kit_versions", kitVersionRowSchema, data);
  }
  async saveKit(yaml: string, note: string | null, actor: string) {
    const latest = await this.latestKit();
    // Version 1 is the kit in the repository; the owner's first save is version 2.
    const version = (latest?.version ?? 1) + 1;
    const { error } = await this.client.from("studio_kit_versions").insert({ version, yaml, note, created_by: actor });
    if (error) fail("studio_kit_versions", error);
    return version;
  }
  async latestPrompt(agent: string) {
    const { data, error } = await this.client.from("studio_prompts").select("*").eq("agent", agent).order("version", { ascending: false }).limit(1).maybeSingle();
    if (error) fail("studio_prompts", error);
    return one("studio_prompts", promptRowSchema, data);
  }
  async prompt(agent: string, version: number) {
    const { data, error } = await this.client.from("studio_prompts").select("*").eq("agent", agent).eq("version", version).maybeSingle();
    if (error) fail("studio_prompts", error);
    return one("studio_prompts", promptRowSchema, data);
  }
  async prompts(agent?: string) {
    let query = this.client.from("studio_prompts").select("*").order("version", { ascending: false });
    if (agent) query = query.eq("agent", agent);
    const { data, error } = await query;
    if (error) fail("studio_prompts", error);
    return rows("studio_prompts", promptRowSchema, data);
  }
  async savePrompt(agent: string, text: string, note: string | null, actor: string) {
    const latest = await this.latestPrompt(agent);
    const version = (latest?.version ?? 1) + 1;
    const { error } = await this.client.from("studio_prompts").insert({ agent, version, text, note, created_by: actor });
    if (error) fail("studio_prompts", error);
    return version;
  }

  async hooks(filter: { language?: Language; pillar?: Pillar; retired?: boolean } = {}) {
    let query = this.client.from("studio_hooks").select("*").order("created_at");
    if (filter.language) query = query.eq("language", filter.language);
    if (filter.pillar) query = query.eq("pillar", filter.pillar);
    if (filter.retired !== undefined) query = query.eq("retired", filter.retired);
    const { data, error } = await query;
    if (error) fail("studio_hooks", error);
    return rows("studio_hooks", hookRowSchema, data);
  }
  async addHooks(list: { text: string; pillar: Pillar; language: Language; source: string }[]) {
    if (list.length === 0) return 0;
    const existing = await this.hooks();
    const seen = new Set(existing.map((h) => `${h.language}|${h.text.toLowerCase()}`));
    const fresh = list.filter((h) => {
      const key = `${h.language}|${h.text.toLowerCase()}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    if (fresh.length === 0) return 0;
    const { error } = await this.client.from("studio_hooks").insert(fresh);
    if (error) fail("studio_hooks", error);
    return fresh.length;
  }
  async updateHook(id: string, patch: Partial<Pick<HookRow, "text" | "pillar" | "retired" | "stats">>) {
    const { error } = await this.client.from("studio_hooks").update(patch).eq("id", id);
    if (error) fail("studio_hooks", error);
  }

  async insertCards(cards: readonly NewCard[], actor: string) {
    if (cards.length === 0) return [];
    const { data, error } = await this.client
      .from("studio_cards")
      .insert(cards.map((c) => ({ ...c, created_by: c.created_by ?? actor, updated_by: actor })))
      .select("*");
    if (error) fail("studio_cards", error);
    return rows("studio_cards", cardRowSchema, data);
  }
  async cards(filter: CardFilter) {
    let query = this.client.from("studio_cards").select("*").order("created_at");
    if (filter.ids) query = query.in("id", [...filter.ids]);
    if (filter.weeks) query = query.in("week", [...filter.weeks]);
    if (filter.statuses) query = query.in("status", [...filter.statuses]);
    if (filter.pillar) query = query.eq("pillar", filter.pillar);
    if (filter.language) query = query.eq("language", filter.language);
    if (filter.parent) query = query.eq("parent", filter.parent);
    if (filter.createdSince) query = query.gte("created_at", filter.createdSince);
    if (filter.limit) query = query.limit(filter.limit);
    const { data, error } = await query;
    if (error) fail("studio_cards", error);
    return rows("studio_cards", cardRowSchema, data);
  }
  async updateCards(ids: readonly string[], patch: CardPatch, actor: string) {
    if (ids.length === 0) return;
    const { error } = await this.client.from("studio_cards").update({ ...patch, updated_by: actor }).in("id", [...ids]);
    if (error) fail("studio_cards", error);
  }
  async insertPosts(posts: readonly NewPost[], actor: string) {
    if (posts.length === 0) return [];
    const { data, error } = await this.client
      .from("studio_posts")
      .insert(posts.map((p) => ({ ...p, updated_by: p.updated_by ?? actor })))
      .select("*");
    if (error) fail("studio_posts", error);
    return rows("studio_posts", postRowSchema, data);
  }
  async posts(filter: PostFilter) {
    let query = this.client.from("studio_posts").select("*").order("scheduled_at", { ascending: true, nullsFirst: false });
    if (filter.ids) query = query.in("id", [...filter.ids]);
    if (filter.cardIds) query = query.in("card_id", [...filter.cardIds]);
    if (filter.statuses) query = query.in("status", [...filter.statuses]);
    if (filter.platforms) query = query.in("platform", [...filter.platforms]);
    if (filter.formats) query = query.in("format", [...filter.formats]);
    if (filter.language) query = query.eq("language", filter.language);
    if (filter.scheduledFrom) query = query.gte("scheduled_at", filter.scheduledFrom);
    if (filter.scheduledTo) query = query.lt("scheduled_at", filter.scheduledTo);
    if (filter.postedFrom) query = query.gte("posted_at", filter.postedFrom);
    if (filter.byHand !== undefined) query = query.eq("by_hand", filter.byHand);
    if (filter.limit) query = query.limit(filter.limit);
    const { data, error } = await query;
    if (error) fail("studio_posts", error);
    return rows("studio_posts", postRowSchema, data);
  }
  async updatePosts(ids: readonly string[], patch: PostPatch, actor: string) {
    if (ids.length === 0) return;
    const { error } = await this.client.from("studio_posts").update({ ...patch, updated_by: actor }).in("id", [...ids]);
    if (error) fail("studio_posts", error);
  }

  async insertMedia(media: NewMedia) {
    const { data, error } = await this.client.from("studio_media").insert(media).select("*").single();
    if (error) fail("studio_media", error);
    const row = one("studio_media", mediaRowSchema, data);
    if (!row) throw new StudioStorageError("studio_media: the new row didn't come back");
    return row;
  }
  async media(filter: { ids?: readonly string[]; postIds?: readonly string[]; kinds?: readonly string[]; limit?: number }) {
    let query = this.client.from("studio_media").select("*").order("created_at", { ascending: false });
    if (filter.ids) query = query.in("id", [...filter.ids]);
    if (filter.postIds) query = query.in("post_id", [...filter.postIds]);
    if (filter.kinds) query = query.in("kind", [...filter.kinds]);
    if (filter.limit) query = query.limit(filter.limit);
    const { data, error } = await query;
    if (error) fail("studio_media", error);
    return rows("studio_media", mediaRowSchema, data);
  }
  async deleteMedia(ids: readonly string[]) {
    if (ids.length === 0) return;
    const { error } = await this.client.from("studio_media").delete().in("id", [...ids]);
    if (error) fail("studio_media", error);
  }
  async upsertMetrics(list: readonly Omit<MetricRow, "fetched_at">[]) {
    if (list.length === 0) return;
    const { error } = await this.client.from("studio_metrics").upsert(list.map((m) => ({ ...m, fetched_at: nowIso() })), { onConflict: "post_id,day" });
    if (error) fail("studio_metrics", error);
  }
  async metrics(filter: { from: string; to: string; postIds?: readonly string[] }) {
    let query = this.client.from("studio_metrics").select("*").gte("day", filter.from).lt("day", filter.to);
    if (filter.postIds) query = query.in("post_id", [...filter.postIds]);
    const { data, error } = await query;
    if (error) fail("studio_metrics", error);
    return rows("studio_metrics", metricRowSchema, data);
  }
  async upsertOrders(list: readonly Omit<OrderRow, "fetched_at">[]) {
    if (list.length === 0) return;
    const { error } = await this.client.from("studio_orders").upsert(list.map((o) => ({ ...o, fetched_at: nowIso() })), { onConflict: "session_id" });
    if (error) fail("studio_orders", error);
  }
  async orders(filter: { from: string; to: string }) {
    const { data, error } = await this.client.from("studio_orders").select("*").gte("created", filter.from).lt("created", filter.to);
    if (error) fail("studio_orders", error);
    return rows("studio_orders", orderRowSchema, data);
  }

  async insertReplies(list: readonly NewReply[]) {
    if (list.length === 0) return [];
    const { data, error } = await this.client
      .from("studio_replies")
      .upsert([...list], { onConflict: "platform,thread_ref", ignoreDuplicates: true })
      .select("*");
    if (error) fail("studio_replies", error);
    return rows("studio_replies", replyRowSchema, data);
  }
  async replies(filter: ReplyFilter) {
    let query = this.client.from("studio_replies").select("*").order("received_at", { ascending: false });
    if (filter.ids) query = query.in("id", [...filter.ids]);
    if (filter.statuses) query = query.in("status", [...filter.statuses]);
    if (filter.flagged !== undefined) query = filter.flagged ? query.neq("flag", "none") : query.eq("flag", "none");
    if (filter.since) query = query.gte("received_at", filter.since);
    if (filter.authorRef) query = query.eq("author_ref", filter.authorRef);
    if (filter.platform) query = query.eq("platform", filter.platform);
    if (filter.limit) query = query.limit(filter.limit);
    const { data, error } = await query;
    if (error) fail("studio_replies", error);
    return rows("studio_replies", replyRowSchema, data);
  }
  async updateReply(id: string, patch: ReplyPatch, actor: string) {
    const { error } = await this.client.from("studio_replies").update({ ...patch, updated_by: actor }).eq("id", id);
    if (error) fail("studio_replies", error);
  }
  async deleteExpiredReplies(now: string) {
    const { data, error } = await this.client.from("studio_replies").delete().lt("expires_at", now).select("id");
    if (error) fail("studio_replies", error);
    return Array.isArray(data) ? data.length : 0;
  }

  async deleteRuns(filter: { agent: string; before: string }) {
    const { data, error } = await this.client.from("studio_runs").delete().eq("agent", filter.agent).lt("started_at", filter.before).select("id");
    if (error) fail("studio_runs", error);
    return Array.isArray(data) ? data.length : 0;
  }

  async startRun(start: RunStart) {
    const { data, error } = await this.client
      .from("studio_runs")
      .insert({ agent: start.agent, trigger: start.trigger, model: start.model ?? null, prompt_version: start.promptVersion ?? null, details: start.details ?? {} })
      .select("*")
      .single();
    if (error) fail("studio_runs", error);
    const row = one("studio_runs", runRowSchema, data);
    if (!row) throw new StudioStorageError("studio_runs: the new row didn't come back");
    return row;
  }
  async finishRun(id: string, finish: RunFinish) {
    const patch: Record<string, unknown> = { finished_at: nowIso(), outcome: finish.outcome, error: finish.error ?? null };
    if (finish.model !== undefined) patch["model"] = finish.model;
    if (finish.usage) {
      patch["input_tokens"] = finish.usage.inputTokens;
      patch["output_tokens"] = finish.usage.outputTokens;
      patch["cache_read_tokens"] = finish.usage.cacheReadTokens;
      patch["cache_write_tokens"] = finish.usage.cacheWriteTokens;
    }
    if (finish.costUsd !== undefined) patch["cost_usd"] = finish.costUsd;
    if (finish.wrote) patch["wrote"] = finish.wrote;
    if (finish.logUrl) patch["log_url"] = finish.logUrl;
    if (finish.details) {
      const { data } = await this.client.from("studio_runs").select("details").eq("id", id).maybeSingle();
      const before = (data as { details?: Record<string, unknown> } | null)?.details ?? {};
      patch["details"] = { ...before, ...finish.details };
    }
    const { error } = await this.client.from("studio_runs").update(patch).eq("id", id);
    if (error) fail("studio_runs", error);
  }
  async runs(filter: RunFilter) {
    let query = this.client.from("studio_runs").select("*").order("started_at", { ascending: false });
    if (filter.agent) query = query.eq("agent", filter.agent);
    if (filter.since) query = query.gte("started_at", filter.since);
    if (filter.outcome) query = query.eq("outcome", filter.outcome);
    query = query.limit(filter.limit ?? 500);
    const { data, error } = await query;
    if (error) fail("studio_runs", error);
    return rows("studio_runs", runRowSchema, data);
  }
  async spendSince(since: string, agent?: string) {
    let query = this.client.from("studio_runs").select("cost_usd").gte("started_at", since);
    if (agent) query = query.eq("agent", agent);
    const { data, error } = await query;
    if (error) fail("studio_runs", error);
    return (Array.isArray(data) ? data : []).reduce((sum, r) => sum + Number((r as { cost_usd: unknown }).cost_usd ?? 0), 0);
  }
  async events(filter: { table?: string; rowId?: string; since?: string; limit?: number }) {
    let query = this.client.from("studio_events").select("*").order("id", { ascending: false });
    if (filter.table) query = query.eq("table_name", filter.table);
    if (filter.rowId) query = query.eq("row_id", filter.rowId);
    if (filter.since) query = query.gte("at", filter.since);
    query = query.limit(filter.limit ?? 200);
    const { data, error } = await query;
    if (error) fail("studio_events", error);
    return rows("studio_events", eventRowSchema, data);
  }
  async logEvent(event: { table: string; rowId: string; from?: string | null; to?: string | null; actor: string; note?: string | null }) {
    const { error } = await this.client.from("studio_events").insert({
      table_name: event.table,
      row_id: event.rowId,
      from_status: event.from ?? null,
      to_status: event.to ?? null,
      actor: event.actor,
      note: event.note ?? null,
    });
    if (error) fail("studio_events", error);
  }

  async insertReminder(reminder: NewReminder) {
    const row = { ...reminder, updated_by: reminder.created_by ?? "owner" };
    const query = reminder.dedupe_key
      ? this.client.from("studio_reminders").upsert(row, { onConflict: "dedupe_key", ignoreDuplicates: true }).select("*")
      : this.client.from("studio_reminders").insert(row).select("*");
    const { data, error } = await query;
    if (error) fail("studio_reminders", error);
    return rows("studio_reminders", reminderRowSchema, data)[0] ?? null;
  }
  async reminders(filter: ReminderFilter) {
    let query = this.client.from("studio_reminders").select("*").order("due_at");
    if (filter.statuses) query = query.in("status", [...filter.statuses]);
    if (filter.dueBefore) query = query.lte("due_at", filter.dueBefore);
    if (filter.dueAfter) query = query.gte("due_at", filter.dueAfter);
    if (filter.createdBy) query = query.eq("created_by", filter.createdBy);
    if (filter.createdSince) query = query.gte("created_at", filter.createdSince);
    query = query.limit(filter.limit ?? 500);
    const { data, error } = await query;
    if (error) fail("studio_reminders", error);
    return rows("studio_reminders", reminderRowSchema, data);
  }
  async updateReminder(id: string, patch: ReminderPatch, actor: string) {
    const { error } = await this.client.from("studio_reminders").update({ ...patch, updated_by: actor }).eq("id", id);
    if (error) fail("studio_reminders", error);
  }

  async sky(filter: { from: string; to: string }) {
    const { data, error } = await this.client.from("studio_sky").select("*").gte("date", filter.from).lt("date", filter.to).order("date");
    if (error) fail("studio_sky", error);
    return rows("studio_sky", skyRowSchema, data);
  }
  async upsertSky(list: readonly NewSky[]) {
    if (list.length === 0) return 0;
    const { error } = await this.client.from("studio_sky").upsert([...list], { onConflict: "date,kind,body,event" });
    if (error) fail("studio_sky", error);
    return list.length;
  }
  async deleteSky(id: string) {
    const { error } = await this.client.from("studio_sky").delete().eq("id", id);
    if (error) fail("studio_sky", error);
  }
  async calendar(filter: { from: string; to: string }) {
    const { data, error } = await this.client.from("studio_calendar").select("*").gte("date", filter.from).lt("date", filter.to).order("date");
    if (error) fail("studio_calendar", error);
    return rows("studio_calendar", calendarRowSchema, data);
  }
  async upsertCalendar(list: readonly NewCalendar[]) {
    if (list.length === 0) return 0;
    const { error } = await this.client.from("studio_calendar").upsert([...list], { onConflict: "date,event" });
    if (error) fail("studio_calendar", error);
    return list.length;
  }
  async deleteCalendar(id: string) {
    const { error } = await this.client.from("studio_calendar").delete().eq("id", id);
    if (error) fail("studio_calendar", error);
  }
  async upsertSources(list: readonly NewSource[]) {
    if (list.length === 0) return 0;
    const { error } = await this.client.from("studio_sources").upsert(list.map((s) => ({ ...s, updated_at: nowIso() })), { onConflict: "site,path" });
    if (error) fail("studio_sources", error);
    return list.length;
  }
  async sources(filter: { sites?: readonly string[]; language?: Language; limit?: number }) {
    let query = this.client.from("studio_sources").select("*").order("updated_at", { ascending: false });
    if (filter.sites) query = query.in("site", [...filter.sites]);
    if (filter.language) query = query.eq("language", filter.language);
    query = query.limit(filter.limit ?? 1000);
    const { data, error } = await query;
    if (error) fail("studio_sources", error);
    return rows("studio_sources", sourceRowSchema, data);
  }

  async connections() {
    const { data, error } = await this.client.from("studio_connections").select("*");
    if (error) fail("studio_connections", error);
    return rows("studio_connections", connectionRowSchema, data);
  }
  async upsertConnection(row: Omit<ConnectionRow, "updated_at">) {
    const { error } = await this.client.from("studio_connections").upsert({ ...row, updated_at: nowIso() });
    if (error) fail("studio_connections", error);
  }
  async putSecret(name: string, value: string) {
    const { data, error } = await this.client.rpc("studio_secret_put", { p_name: name, p_secret: value });
    if (error) fail("vault", error);
    return String(data);
  }
  async secret(name: string) {
    const { data, error } = await this.client.rpc("studio_secret_get", { p_name: name });
    if (error) fail("vault", error);
    return typeof data === "string" ? data : null;
  }
  async deleteSecret(name: string) {
    const { error } = await this.client.rpc("studio_secret_delete", { p_name: name });
    if (error) fail("vault", error);
  }
  async tickSecret() {
    const { data, error } = await this.client.rpc("studio_tick_secret");
    if (error) fail("vault", error);
    return typeof data === "string" && data ? data : null;
  }
  async startTick(url: string, secret: string) {
    const { data, error } = await this.client.rpc("studio_tick_setup", { p_url: url, p_secret: secret });
    if (error) fail("the clock", error);
    return String(data ?? "the tick runs every 15 minutes");
  }
  async stopTick() {
    const { data, error } = await this.client.rpc("studio_tick_stop");
    if (error) fail("the clock", error);
    return String(data ?? "the tick is stopped");
  }
  async studioKeys() {
    const { data, error } = await this.client.rpc("studio_keys");
    if (error) fail("vault", error);
    return z.array(z.object({ name: z.string(), secret: z.string(), updated_at: z.string() })).parse(data ?? []).map((k) => ({ name: k.name, value: k.secret, updated_at: k.updated_at }));
  }

  async templates() {
    const { data, error } = await this.client.from("studio_templates").select("*").order("created_at");
    if (error) fail("studio_templates", error);
    return rows("studio_templates", templateRowSchema, data);
  }
  async saveTemplate(row: Omit<TemplateRow, "id" | "created_at"> & { id?: string }) {
    const { data, error } = await this.client.from("studio_templates").upsert(row).select("*").single();
    if (error) fail("studio_templates", error);
    const saved = one("studio_templates", templateRowSchema, data);
    if (!saved) throw new StudioStorageError("studio_templates: the row didn't come back");
    return saved;
  }
  async deleteTemplate(id: string) {
    const { error } = await this.client.from("studio_templates").delete().eq("id", id);
    if (error) fail("studio_templates", error);
  }
  async scorecard(week: string) {
    const { data, error } = await this.client.from("studio_scorecards").select("*").eq("week", week).maybeSingle();
    if (error) fail("studio_scorecards", error);
    return one("studio_scorecards", scorecardRowSchema, data);
  }
  async scorecards(limit: number) {
    const { data, error } = await this.client.from("studio_scorecards").select("*").order("week", { ascending: false }).limit(limit);
    if (error) fail("studio_scorecards", error);
    return rows("studio_scorecards", scorecardRowSchema, data);
  }
  async putScorecard(row: Omit<ScorecardRow, "created_at">) {
    const { error } = await this.client.from("studio_scorecards").upsert(row);
    if (error) fail("studio_scorecards", error);
  }
  async weeklyInputs(week: string) {
    const { data, error } = await this.client.from("studio_weekly_inputs").select("*").eq("week", week).maybeSingle();
    if (error) fail("studio_weekly_inputs", error);
    return one("studio_weekly_inputs", weeklyInputRowSchema, data);
  }
  async putWeeklyInputs(row: Omit<WeeklyInputRow, "updated_at">) {
    const { error } = await this.client.from("studio_weekly_inputs").upsert({ ...row, updated_at: nowIso() });
    if (error) fail("studio_weekly_inputs", error);
  }

  async tts(hash: string) {
    const { data, error } = await this.client.from("studio_tts").select("*").eq("hash", hash).maybeSingle();
    if (error) fail("studio_tts", error);
    return one("studio_tts", ttsRowSchema, data);
  }
  async putTts(row: Omit<TtsRow, "created_at">) {
    const { error } = await this.client.from("studio_tts").upsert(row);
    if (error) fail("studio_tts", error);
  }
  async ttsSince(since: string) {
    const { data, error } = await this.client.from("studio_tts").select("characters,duration_ms").gte("created_at", since);
    if (error) fail("studio_tts", error);
    let characters = 0;
    let durationMs = 0;
    for (const r of Array.isArray(data) ? data : []) {
      characters += Number((r as { characters: unknown }).characters ?? 0);
      durationMs += Number((r as { duration_ms: unknown }).duration_ms ?? 0);
    }
    return { characters, durationMs };
  }

  async studySessions(filter: { from: string; to: string }) {
    const { data, error } = await this.client
      .from("study_sessions")
      .select(STUDY_SESSION_COLUMNS)
      .gte("created_at", filter.from)
      .lt("created_at", filter.to);
    if (error) {
      // The Study's tables are AGS's; until its migration has run they don't exist, and that is not the
      // Studio's failure: the agents then see no tests rather than stopping.
      if (/does not exist|schema cache/i.test(error.message)) return [];
      fail("study_sessions", error);
    }
    return rows("study_sessions", studySessionRowSchema, data);
  }
}

export class SupabaseMediaStorage implements MediaStorage {
  constructor(private readonly client: SupabaseClient, private readonly bucket = "studio") {}

  async upload(path: string, bytes: Uint8Array, contentType: string) {
    const { error } = await this.client.storage.from(this.bucket).upload(path, bytes, { contentType, upsert: true });
    if (error) throw new StudioStorageError(`storage upload ${path}: ${error.message}`);
  }
  async download(path: string) {
    const { data, error } = await this.client.storage.from(this.bucket).download(path);
    if (error || !data) throw new StudioStorageError(`storage download ${path}: ${error?.message ?? "no data"}`);
    return new Uint8Array(await data.arrayBuffer());
  }
  async signedUrl(path: string, seconds: number) {
    const { data, error } = await this.client.storage.from(this.bucket).createSignedUrl(path, seconds);
    if (error || !data) throw new StudioStorageError(`storage signed url ${path}: ${error?.message ?? "no url"}`);
    return data.signedUrl;
  }
  async remove(paths: readonly string[]) {
    if (paths.length === 0) return;
    const { error } = await this.client.storage.from(this.bucket).remove([...paths]);
    if (error) throw new StudioStorageError(`storage remove: ${error.message}`);
  }
  async exists(path: string) {
    const slash = path.lastIndexOf("/");
    const dir = slash >= 0 ? path.slice(0, slash) : "";
    const name = slash >= 0 ? path.slice(slash + 1) : path;
    const { data, error } = await this.client.storage.from(this.bucket).list(dir, { search: name, limit: 10 });
    if (error) return false;
    return (data ?? []).some((f) => f.name === name);
  }
  async list(prefix: string) {
    const dir = prefix.replace(/\/$/, "");
    const { data, error } = await this.client.storage.from(this.bucket).list(dir, { limit: 1000, sortBy: { column: "created_at", order: "asc" } });
    if (error) throw new StudioStorageError(`storage list: ${error.message}`);
    // Folders come back without an id; only files are listed.
    return (data ?? []).filter((f) => f.id).map((f) => ({ path: `${dir}/${f.name}`, createdAt: f.created_at ?? null }));
  }
}

/** The secret-key client from the environment, or null with what is missing. */
export function serviceClientFromEnv(): { client: SupabaseClient | null; missing: string | null } {
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "").trim();
  const key = (process.env.SUPABASE_SECRET_KEY ?? "").trim();
  if (url === "") return { client: null, missing: "NEXT_PUBLIC_SUPABASE_URL is not set" };
  if (key === "") return { client: null, missing: "SUPABASE_SECRET_KEY is not set" };
  return { client: createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }), missing: null };
}
