/**
 * The Studio's store held in memory: the agents and the flows run against it in tests and local dry
 * runs, with the same behaviour as the database (defaults, uniqueness, the audit trail of statuses).
 */
import { randomUUID } from "node:crypto";
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
} from "./store";
import type { Language, Pillar } from "../types";

const nowIso = () => new Date().toISOString();
const within = <T>(list: readonly T[] | undefined, value: T) => !list || list.length === 0 || list.includes(value);

export class MemoryStore implements StudioStore {
  settings = new Map<string, Record<string, unknown>>();
  nodes = new Map<string, NodeRow>();
  kits: KitVersionRow[] = [];
  promptRows: PromptRow[] = [];
  hookRows: HookRow[] = [];
  cardRows: CardRow[] = [];
  postRows: PostRow[] = [];
  mediaRows: MediaRow[] = [];
  metricRows: MetricRow[] = [];
  orderRows: OrderRow[] = [];
  replyRows: ReplyRow[] = [];
  runRows: RunRow[] = [];
  eventRows: EventRow[] = [];
  reminderRows: ReminderRow[] = [];
  skyRows: SkyRow[] = [];
  calendarRows: CalendarRow[] = [];
  sourceRows: SourceRow[] = [];
  connectionRows = new Map<string, ConnectionRow>();
  secrets = new Map<string, string>();
  templateRows: TemplateRow[] = [];
  scorecardRows = new Map<string, ScorecardRow>();
  weeklyRows = new Map<string, WeeklyInputRow>();
  ttsRows = new Map<string, TtsRow>();
  studyRows: StudySessionRow[] = [];
  private eventId = 0;

  private audit(table: string, rowId: string, from: string | null, to: string, actor: string) {
    this.eventId += 1;
    this.eventRows.push({ id: this.eventId, table_name: table, row_id: rowId, from_status: from, to_status: to, actor, at: nowIso(), note: null });
  }

  async allSettings() {
    return Object.fromEntries(this.settings);
  }
  async putSettings(node: string, settings: Record<string, unknown>) {
    this.settings.set(node, settings);
  }
  async nodePositions() {
    return [...this.nodes.values()];
  }
  async putNodePosition(node: string, x: number, y: number, collapsed: boolean) {
    this.nodes.set(node, { node, x, y, collapsed, updated_at: nowIso() });
  }
  async resetNodePositions() {
    this.nodes.clear();
  }

  async latestKit() {
    return this.kits.reduce<KitVersionRow | null>((best, k) => (!best || k.version > best.version ? k : best), null);
  }
  async kitVersions(limit = 50) {
    return [...this.kits].sort((a, b) => b.version - a.version).slice(0, limit);
  }
  async saveKit(yaml: string, note: string | null, actor: string) {
    const version = Math.max(1, this.kits.reduce((m, k) => Math.max(m, k.version), 0)) + 1;
    this.kits.push({ version, yaml, note, created_at: nowIso(), created_by: actor });
    return version;
  }
  async latestPrompt(agent: string) {
    return this.promptRows.filter((p) => p.agent === agent).sort((a, b) => b.version - a.version)[0] ?? null;
  }
  async prompt(agent: string, version: number) {
    return this.promptRows.find((p) => p.agent === agent && p.version === version) ?? null;
  }
  async prompts(agent?: string) {
    return this.promptRows.filter((p) => !agent || p.agent === agent).sort((a, b) => b.version - a.version);
  }
  async savePrompt(agent: string, text: string, note: string | null, actor: string) {
    const version = this.promptRows.filter((p) => p.agent === agent).reduce((m, p) => Math.max(m, p.version), 0) + 1;
    this.promptRows.push({ agent, version, text, note, created_at: nowIso(), created_by: actor });
    return version;
  }

  async hooks(filter: { language?: Language; pillar?: Pillar; retired?: boolean } = {}) {
    return this.hookRows.filter(
      (h) =>
        (!filter.language || h.language === filter.language) &&
        (!filter.pillar || h.pillar === filter.pillar) &&
        (filter.retired === undefined || h.retired === filter.retired),
    );
  }
  async addHooks(rows: { text: string; pillar: Pillar; language: Language; source: string }[]) {
    let added = 0;
    for (const row of rows) {
      const exists = this.hookRows.some((h) => h.language === row.language && h.text.toLowerCase() === row.text.toLowerCase());
      if (exists) continue;
      this.hookRows.push({ id: randomUUID(), ...row, retired: false, stats: {}, created_at: nowIso(), updated_at: nowIso() });
      added += 1;
    }
    return added;
  }
  async updateHook(id: string, patch: Partial<Pick<HookRow, "text" | "pillar" | "retired" | "stats">>) {
    this.hookRows = this.hookRows.map((h) => (h.id === id ? { ...h, ...patch, updated_at: nowIso() } : h));
  }

  async insertCards(cards: readonly NewCard[], actor: string) {
    const out: CardRow[] = cards.map((c) => ({
      id: randomUUID(),
      week: c.week,
      pillar: c.pillar,
      language: c.language,
      idea: c.idea,
      hook: c.hook,
      points: [...c.points],
      figures: [...c.figures],
      cta: c.cta,
      anchor: c.anchor ?? null,
      sky_date: c.sky_date ?? null,
      formats: [...c.formats],
      src: c.src ?? null,
      kit_version: c.kit_version ?? null,
      prompt_version: c.prompt_version ?? null,
      parent: c.parent ?? null,
      hook_id: c.hook_id ?? null,
      status: c.status ?? "draft",
      reason: c.reason ?? null,
      run_id: c.run_id ?? null,
      created_by: c.created_by ?? actor,
      approved_at: null,
      approved_by: null,
      updated_by: actor,
      created_at: nowIso(),
      updated_at: nowIso(),
    }));
    for (const c of out) this.audit("studio_cards", c.id, null, c.status, actor);
    this.cardRows.push(...out);
    return out;
  }
  async cards(filter: CardFilter) {
    const rows = this.cardRows
      .filter(
        (c) =>
          within(filter.ids, c.id) &&
          within(filter.weeks, c.week) &&
          within(filter.statuses, c.status) &&
          (!filter.pillar || c.pillar === filter.pillar) &&
          (!filter.language || c.language === filter.language) &&
          (!filter.parent || c.parent === filter.parent) &&
          (!filter.createdSince || c.created_at >= filter.createdSince),
      )
      .sort((a, b) => a.created_at.localeCompare(b.created_at));
    return filter.limit ? rows.slice(0, filter.limit) : rows;
  }
  async updateCards(ids: readonly string[], patch: CardPatch, actor: string) {
    this.cardRows = this.cardRows.map((c) => {
      if (!ids.includes(c.id)) return c;
      const next = { ...c, ...patch, updated_by: actor, updated_at: nowIso() };
      if (patch.status && patch.status !== c.status) this.audit("studio_cards", c.id, c.status, patch.status, actor);
      return next;
    });
  }
  async insertPosts(posts: readonly NewPost[], actor: string) {
    const out: PostRow[] = posts.map((p) => ({
      id: randomUUID(),
      card_id: p.card_id,
      platform: p.platform,
      format: p.format,
      language: p.language,
      script: p.script ?? null,
      lines: p.lines ?? null,
      caption: p.caption ?? null,
      title: p.title ?? null,
      description: p.description ?? null,
      tags: p.tags ? [...p.tags] : [],
      slides: p.slides ?? null,
      spec: p.spec ?? null,
      disclosure: p.disclosure ?? false,
      scheduled_at: p.scheduled_at ?? null,
      status: p.status ?? "draft",
      gate: p.gate ?? null,
      by_hand: p.by_hand ?? false,
      platform_post_id: null,
      platform_url: null,
      platform_state: null,
      posted_at: null,
      error: null,
      retries: 0,
      approved_at: null,
      approved_by: null,
      confirmed_at: null,
      run_id: p.run_id ?? null,
      updated_by: actor,
      created_at: nowIso(),
      updated_at: nowIso(),
    }));
    for (const p of out) this.audit("studio_posts", p.id, null, p.status, actor);
    this.postRows.push(...out);
    return out;
  }
  async posts(filter: PostFilter) {
    const rows = this.postRows
      .filter(
        (p) =>
          within(filter.ids, p.id) &&
          within(filter.cardIds, p.card_id) &&
          within(filter.statuses, p.status) &&
          within(filter.platforms, p.platform) &&
          within(filter.formats, p.format) &&
          (!filter.language || p.language === filter.language) &&
          (!filter.scheduledFrom || (p.scheduled_at !== null && p.scheduled_at >= filter.scheduledFrom)) &&
          (!filter.scheduledTo || (p.scheduled_at !== null && p.scheduled_at < filter.scheduledTo)) &&
          (!filter.postedFrom || (p.posted_at !== null && p.posted_at >= filter.postedFrom)) &&
          (filter.byHand === undefined || p.by_hand === filter.byHand),
      )
      .sort((a, b) => (a.scheduled_at ?? a.created_at).localeCompare(b.scheduled_at ?? b.created_at));
    return filter.limit ? rows.slice(0, filter.limit) : rows;
  }
  async updatePosts(ids: readonly string[], patch: PostPatch, actor: string) {
    this.postRows = this.postRows.map((p) => {
      if (!ids.includes(p.id)) return p;
      if (patch.status && patch.status !== p.status) this.audit("studio_posts", p.id, p.status, patch.status, actor);
      return { ...p, ...patch, updated_by: actor, updated_at: nowIso() };
    });
  }

  async insertMedia(media: NewMedia) {
    const row: MediaRow = { ...media, id: randomUUID(), created_at: nowIso() };
    this.mediaRows.push(row);
    return row;
  }
  async media(filter: { ids?: readonly string[]; postIds?: readonly string[]; kinds?: readonly string[]; limit?: number }) {
    const rows = this.mediaRows.filter((m) => within(filter.ids, m.id) && (!filter.postIds || (m.post_id !== null && filter.postIds.includes(m.post_id))) && within(filter.kinds, m.kind));
    return filter.limit ? rows.slice(-filter.limit) : rows;
  }
  async deleteMedia(ids: readonly string[]) {
    this.mediaRows = this.mediaRows.filter((m) => !ids.includes(m.id));
  }
  async upsertMetrics(rows: readonly Omit<MetricRow, "fetched_at">[]) {
    for (const row of rows) {
      this.metricRows = this.metricRows.filter((m) => !(m.post_id === row.post_id && m.day === row.day));
      this.metricRows.push({ ...row, fetched_at: nowIso() });
    }
  }
  async metrics(filter: { from: string; to: string; postIds?: readonly string[] }) {
    return this.metricRows.filter((m) => m.day >= filter.from && m.day < filter.to && (!filter.postIds || filter.postIds.includes(m.post_id)));
  }
  async upsertOrders(rows: readonly Omit<OrderRow, "fetched_at">[]) {
    for (const row of rows) {
      this.orderRows = this.orderRows.filter((o) => o.session_id !== row.session_id);
      this.orderRows.push({ ...row, fetched_at: nowIso() });
    }
  }
  async orders(filter: { from: string; to: string }) {
    return this.orderRows.filter((o) => o.created >= filter.from && o.created < filter.to);
  }

  async insertReplies(rows: readonly NewReply[]) {
    const out: ReplyRow[] = [];
    for (const r of rows) {
      if (this.replyRows.some((x) => x.platform === r.platform && x.thread_ref === r.thread_ref)) continue;
      const row: ReplyRow = {
        id: randomUUID(),
        platform: r.platform,
        thread_ref: r.thread_ref,
        parent_ref: r.parent_ref ?? null,
        post_id: r.post_id ?? null,
        author_handle: r.author_handle ?? null,
        author_ref: r.author_ref ?? null,
        their_text: r.their_text,
        their_lang: r.their_lang ?? null,
        received_at: r.received_at,
        klass: null,
        draft_reply: null,
        flag: "none",
        flag_reason: null,
        status: "draft",
        sent_at: null,
        sent_ref: null,
        expires_at: new Date(Date.now() + 30 * 86400_000).toISOString(),
        updated_by: "community",
        created_at: nowIso(),
        updated_at: nowIso(),
      };
      this.audit("studio_replies", row.id, null, row.status, "community");
      this.replyRows.push(row);
      out.push(row);
    }
    return out;
  }
  async replies(filter: ReplyFilter) {
    const rows = this.replyRows
      .filter(
        (r) =>
          within(filter.ids, r.id) &&
          within(filter.statuses, r.status) &&
          (filter.flagged === undefined || (r.flag !== "none") === filter.flagged) &&
          (!filter.since || r.received_at >= filter.since) &&
          (!filter.authorRef || r.author_ref === filter.authorRef) &&
          (!filter.platform || r.platform === filter.platform),
      )
      .sort((a, b) => b.received_at.localeCompare(a.received_at));
    return filter.limit ? rows.slice(0, filter.limit) : rows;
  }
  async updateReply(id: string, patch: ReplyPatch, actor: string) {
    this.replyRows = this.replyRows.map((r) => {
      if (r.id !== id) return r;
      if (patch.status && patch.status !== r.status) this.audit("studio_replies", r.id, r.status, patch.status, actor);
      return { ...r, ...patch, updated_by: actor, updated_at: nowIso() };
    });
  }
  async deleteExpiredReplies(now: string) {
    const before = this.replyRows.length;
    this.replyRows = this.replyRows.filter((r) => r.expires_at > now);
    return before - this.replyRows.length;
  }

  async deleteRuns(filter: { agent: string; before: string }) {
    const before = this.runRows.length;
    this.runRows = this.runRows.filter((r) => !(r.agent === filter.agent && r.started_at < filter.before));
    return before - this.runRows.length;
  }

  async startRun(start: RunStart) {
    const row: RunRow = {
      id: randomUUID(),
      agent: start.agent,
      trigger: start.trigger,
      started_at: nowIso(),
      finished_at: null,
      model: start.model ?? null,
      prompt_version: start.promptVersion ?? null,
      input_tokens: 0,
      output_tokens: 0,
      cache_read_tokens: 0,
      cache_write_tokens: 0,
      cost_usd: 0,
      wrote: {},
      outcome: "running",
      error: null,
      log_url: null,
      details: start.details ?? {},
    };
    this.runRows.push(row);
    return row;
  }
  async finishRun(id: string, finish: RunFinish) {
    this.runRows = this.runRows.map((r) =>
      r.id !== id
        ? r
        : {
            ...r,
            finished_at: nowIso(),
            outcome: finish.outcome,
            model: finish.model ?? r.model,
            input_tokens: finish.usage?.inputTokens ?? r.input_tokens,
            output_tokens: finish.usage?.outputTokens ?? r.output_tokens,
            cache_read_tokens: finish.usage?.cacheReadTokens ?? r.cache_read_tokens,
            cache_write_tokens: finish.usage?.cacheWriteTokens ?? r.cache_write_tokens,
            cost_usd: finish.costUsd ?? r.cost_usd,
            wrote: finish.wrote ?? r.wrote,
            error: finish.error ?? null,
            log_url: finish.logUrl ?? r.log_url,
            details: { ...r.details, ...(finish.details ?? {}) },
          },
    );
  }
  async runs(filter: RunFilter) {
    const rows = this.runRows
      .filter((r) => (!filter.agent || r.agent === filter.agent) && (!filter.since || r.started_at >= filter.since) && (!filter.outcome || r.outcome === filter.outcome))
      .sort((a, b) => b.started_at.localeCompare(a.started_at));
    return filter.limit ? rows.slice(0, filter.limit) : rows;
  }
  async spendSince(since: string, agent?: string) {
    return this.runRows.filter((r) => r.started_at >= since && (!agent || r.agent === agent)).reduce((sum, r) => sum + r.cost_usd, 0);
  }
  async events(filter: { table?: string; rowId?: string; since?: string; limit?: number }) {
    const rows = this.eventRows
      .filter((e) => (!filter.table || e.table_name === filter.table) && (!filter.rowId || e.row_id === filter.rowId) && (!filter.since || e.at >= filter.since))
      .sort((a, b) => b.id - a.id);
    return filter.limit ? rows.slice(0, filter.limit) : rows;
  }
  async logEvent(event: { table: string; rowId: string; from?: string | null; to?: string | null; actor: string; note?: string | null }) {
    this.eventId += 1;
    this.eventRows.push({
      id: this.eventId,
      table_name: event.table,
      row_id: event.rowId,
      from_status: event.from ?? null,
      to_status: event.to ?? null,
      actor: event.actor,
      at: nowIso(),
      note: event.note ?? null,
    });
  }

  async insertReminder(r: NewReminder) {
    if (r.dedupe_key && this.reminderRows.some((x) => x.dedupe_key === r.dedupe_key)) return null;
    const row: ReminderRow = {
      id: randomUUID(),
      kind: r.kind,
      title: r.title,
      body: r.body ?? null,
      due_at: r.due_at,
      timezone: r.timezone ?? "Europe/Paris",
      repeat: r.repeat ?? "none",
      channels: r.channels ? [...r.channels] : ["in_app"],
      urgent: r.urgent ?? false,
      linked_table: r.linked_table ?? null,
      linked_id: r.linked_id ?? null,
      link: r.link ?? null,
      created_by: r.created_by ?? "owner",
      status: "scheduled",
      snoozed_until: null,
      sent_at: null,
      dedupe_key: r.dedupe_key ?? null,
      updated_by: r.created_by ?? "owner",
      created_at: nowIso(),
      updated_at: nowIso(),
    };
    this.audit("studio_reminders", row.id, null, row.status, row.created_by);
    this.reminderRows.push(row);
    return row;
  }
  async reminders(filter: ReminderFilter) {
    const rows = this.reminderRows
      .filter(
        (r) =>
          within(filter.statuses, r.status) &&
          (!filter.dueBefore || r.due_at <= filter.dueBefore) &&
          (!filter.dueAfter || r.due_at >= filter.dueAfter) &&
          (!filter.createdBy || r.created_by === filter.createdBy) &&
          (!filter.createdSince || r.created_at >= filter.createdSince),
      )
      .sort((a, b) => a.due_at.localeCompare(b.due_at));
    return filter.limit ? rows.slice(0, filter.limit) : rows;
  }
  async updateReminder(id: string, patch: ReminderPatch, actor: string) {
    this.reminderRows = this.reminderRows.map((r) => {
      if (r.id !== id) return r;
      if (patch.status && patch.status !== r.status) this.audit("studio_reminders", r.id, r.status, patch.status, actor);
      return { ...r, ...patch, updated_by: actor, updated_at: nowIso() };
    });
  }

  async sky(filter: { from: string; to: string }) {
    return this.skyRows.filter((s) => s.date >= filter.from && s.date < filter.to).sort((a, b) => a.date.localeCompare(b.date));
  }
  async upsertSky(rows: readonly NewSky[]) {
    let n = 0;
    for (const row of rows) {
      const i = this.skyRows.findIndex((s) => s.date === row.date && s.kind === row.kind && s.body === row.body && s.event === row.event);
      if (i >= 0) this.skyRows[i] = { ...this.skyRows[i]!, ...row };
      else this.skyRows.push({ ...row, id: randomUUID(), created_at: nowIso() });
      n += 1;
    }
    return n;
  }
  async deleteSky(id: string) {
    this.skyRows = this.skyRows.filter((s) => s.id !== id);
  }
  async calendar(filter: { from: string; to: string }) {
    return this.calendarRows.filter((c) => c.date >= filter.from && c.date < filter.to).sort((a, b) => a.date.localeCompare(b.date));
  }
  async upsertCalendar(rows: readonly NewCalendar[]) {
    let n = 0;
    for (const row of rows) {
      const i = this.calendarRows.findIndex((c) => c.date === row.date && c.event === row.event);
      if (i >= 0) this.calendarRows[i] = { ...this.calendarRows[i]!, ...row };
      else this.calendarRows.push({ ...row, id: randomUUID(), created_at: nowIso() });
      n += 1;
    }
    return n;
  }
  async deleteCalendar(id: string) {
    this.calendarRows = this.calendarRows.filter((c) => c.id !== id);
  }
  async upsertSources(rows: readonly NewSource[]) {
    for (const row of rows) {
      const i = this.sourceRows.findIndex((s) => s.site === row.site && s.path === row.path);
      if (i >= 0) this.sourceRows[i] = { ...this.sourceRows[i]!, ...row, updated_at: nowIso() };
      else this.sourceRows.push({ ...row, id: randomUUID(), updated_at: nowIso() });
    }
    return rows.length;
  }
  async sources(filter: { sites?: readonly string[]; language?: Language; limit?: number }) {
    const rows = this.sourceRows.filter((s) => within(filter.sites, s.site) && (!filter.language || s.language === filter.language));
    return filter.limit ? rows.slice(0, filter.limit) : rows;
  }

  async connections() {
    return [...this.connectionRows.values()];
  }
  async upsertConnection(row: Omit<ConnectionRow, "updated_at">) {
    this.connectionRows.set(row.platform, { ...row, updated_at: nowIso() });
  }
  async putSecret(name: string, value: string) {
    this.secrets.set(name, value);
    return `memory:${name}`;
  }
  async secret(name: string) {
    return this.secrets.get(name) ?? null;
  }
  async deleteSecret(name: string) {
    this.secrets.delete(name);
  }

  async templates() {
    return [...this.templateRows];
  }
  async saveTemplate(row: Omit<TemplateRow, "id" | "created_at"> & { id?: string }) {
    const existing = row.id ? this.templateRows.find((t) => t.id === row.id) : undefined;
    const saved: TemplateRow = { ...row, id: existing?.id ?? randomUUID(), created_at: existing?.created_at ?? nowIso() };
    this.templateRows = [...this.templateRows.filter((t) => t.id !== saved.id), saved];
    return saved;
  }
  async deleteTemplate(id: string) {
    this.templateRows = this.templateRows.filter((t) => t.id !== id);
  }
  async scorecard(week: string) {
    return this.scorecardRows.get(week) ?? null;
  }
  async scorecards(limit: number) {
    return [...this.scorecardRows.values()].sort((a, b) => b.week.localeCompare(a.week)).slice(0, limit);
  }
  async putScorecard(row: Omit<ScorecardRow, "created_at">) {
    this.scorecardRows.set(row.week, { ...row, created_at: nowIso() });
  }
  async weeklyInputs(week: string) {
    return this.weeklyRows.get(week) ?? null;
  }
  async putWeeklyInputs(row: Omit<WeeklyInputRow, "updated_at">) {
    this.weeklyRows.set(row.week, { ...row, updated_at: nowIso() });
  }

  async tts(hash: string) {
    return this.ttsRows.get(hash) ?? null;
  }
  async putTts(row: Omit<TtsRow, "created_at">) {
    this.ttsRows.set(row.hash, { ...row, created_at: nowIso() });
  }
  async ttsSince(since: string) {
    let characters = 0;
    let durationMs = 0;
    for (const row of this.ttsRows.values()) {
      if (row.created_at >= since) {
        characters += row.characters;
        durationMs += row.duration_ms;
      }
    }
    return { characters, durationMs };
  }

  async studySessions(filter: { from: string; to: string }) {
    return this.studyRows.filter((s) => s.created_at >= filter.from && s.created_at < filter.to);
  }
}

/** Files in memory, for tests. */
export class MemoryStorage implements MediaStorage {
  files = new Map<string, { bytes: Uint8Array; contentType: string }>();
  async upload(path: string, bytes: Uint8Array, contentType: string) {
    this.files.set(path, { bytes, contentType });
  }
  async download(path: string) {
    const file = this.files.get(path);
    if (!file) throw new Error(`no file at ${path}`);
    return file.bytes;
  }
  async signedUrl(path: string, seconds: number) {
    return `memory://${path}?expires=${seconds}`;
  }
  async remove(paths: readonly string[]) {
    for (const p of paths) this.files.delete(p);
  }
  async exists(path: string) {
    return this.files.has(path);
  }
  async list(prefix: string) {
    const dir = prefix.endsWith("/") ? prefix : `${prefix}/`;
    return [...this.files.keys()].filter((p) => p.startsWith(dir) && !p.slice(dir.length).includes("/")).map((path) => ({ path, createdAt: null }));
  }
}
