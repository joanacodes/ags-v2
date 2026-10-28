/**
 * The publish worker (no model). Every 15 minutes, when the tick finds something due, and on a dispatch
 * for chosen pieces (Post now). For each piece whose slot falls in the coming window:
 *
 * - by-hand platforms (TikTok until its audit, Substack, Medium, the site): `queued`, with a reminder
 *   30 minutes before the slot, so the owner posts it from Today;
 * - API platforms: `queued` while the call runs, then `posted` with the platform's id and address, or
 *   `failed` with the reason and one retry an hour later.
 *
 * Nothing moves a piece past `approved` but the owner: the outbox only takes pieces approved by the
 * owner's user id, and in `confirm` mode only those the owner confirmed on Today. With STUDIO_LIVE off
 * (or a piece not approved by the owner), the client runs dry: it stops at the first write, the exact
 * request goes to the audit log, and the piece is marked `posted` with a `dry-run:` id.
 */
import { isLive, type AgentContext } from "../agents/context";
import { mediaNeed, VIDEO_FORMATS } from "../render/need";
import { SkipRun, withRun, type RunLog } from "../run";
import type { CardRow, PostRow } from "../store/rows";
import { describeParis, parisTime } from "../time";
import { PLATFORM_LABELS, FORMAT_LABELS, type Platform } from "../types";
import { DryRunStop, Http, PlatformError, redactUrl, type Fetch, type RecordedRequest } from "./http";
import { isPostlyId, postlyDeliveries } from "./postly";
import { mayWrite, publishClientFor } from "./registry";
import type { PublishInput } from "./types";

/** A slot missed by more than this is not posted late: the owner reschedules it. */
export const LATE_HOURS = 3;
/** By-hand pieces are queued, with their reminder, this long before the slot. */
export const BY_HAND_LEAD_MINUTES = 30;
const SIGNED_URL_SECONDS = 7 * 86400;
export const DRY_RUN_PREFIX = "dry-run:";

export const isDryRunId = (id: string | null | undefined) => !!id && id.startsWith(DRY_RUN_PREFIX);

export interface PublishOptions {
  /** A dispatch for chosen pieces: posted now, whatever their slot, with every other check kept. */
  readonly postIds?: readonly string[];
  /** Tests and local runs hand a fake network here. */
  readonly fetchImpl?: Fetch;
  /** Overrides STUDIO_LIVE (tests); the guard still demands the owner's approval. */
  readonly live?: boolean;
  /** Tests skip Postly's waits between upload checks. */
  readonly wait?: (ms: number) => Promise<void>;
}

export type PieceOutcome = "posted" | "dry_run" | "failed" | "by_hand" | "waiting" | "postponed" | "skipped";

interface PublishState {
  readonly stage?: string;
  readonly last_attempt?: string;
  readonly dry_run?: boolean;
  readonly requests?: readonly RecordedRequest[];
  readonly [key: string]: unknown;
}

const stateOf = (post: PostRow): PublishState => (post.platform_state ?? {}) as PublishState;

/** A failed post (not a failed render) is retried once its wait is over, up to the settings' count. */
export function retryDue(post: PostRow, now: Date, outbox: { retry_after_minutes: number; max_retries: number }): boolean {
  const s = stateOf(post);
  if (post.status !== "failed" || s.stage !== "publish" || post.retries > outbox.max_retries) return false;
  const last = s.last_attempt ? Date.parse(s.last_attempt) : 0;
  return now.getTime() - last >= outbox.retry_after_minutes * 60_000;
}

function excerpt(requests: readonly RecordedRequest[], max = 3500): string {
  const text = JSON.stringify(requests.map((r) => ({ method: r.method, url: redactUrl(r.url), body: r.body })));
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

export async function runPublish(ctx: AgentContext, opts: PublishOptions = {}) {
  const { store, settings } = ctx;
  return withRun(store, { agent: "publish", trigger: ctx.trigger, details: opts.postIds ? { postIds: opts.postIds } : {} }, async (log) => {
    if (settings.get("global").paused) throw new SkipRun("skipped", "the Studio is paused (kill switch)");
    const outbox = settings.get("outbox");
    if (!outbox.enabled) throw new SkipRun("skipped", "the outbox is turned off in Settings");
    const live = opts.live ?? isLive();
    if (live && !ctx.ownerId) log.note("STUDY_OWNER_USER_ID isn't set: no approval can be checked, so every post is a dry run");
    if (!live) log.note("STUDIO_LIVE is off: every post is a dry run that logs the request it would send");

    const now = ctx.now;
    await settleStale(ctx, log);
    await confirmPostly(ctx, log, opts.fetchImpl);

    const handEnd = new Date(now.getTime() + (BY_HAND_LEAD_MINUTES + outbox.window_minutes) * 60_000).toISOString();
    const due = opts.postIds?.length
      ? await store.posts({ ids: opts.postIds })
      : [
          ...(await store.posts({ statuses: ["rendered", "approved"], scheduledTo: handEnd })),
          ...(await store.posts({ statuses: ["failed"], scheduledTo: handEnd })).filter((p) => retryDue(p, now, outbox)),
        ];
    if (due.length === 0) throw new SkipRun("skipped", "nothing is due in the next window");
    const cards = new Map((await store.cards({ ids: [...new Set(due.map((p) => p.card_id))] })).map((c) => [c.id, c]));

    const tally: Record<PieceOutcome, number> = { posted: 0, dry_run: 0, failed: 0, by_hand: 0, waiting: 0, postponed: 0, skipped: 0 };
    // One at a time and in slot order: the video gap is checked against what this run just posted.
    for (const post of [...due].sort((a, b) => (a.scheduled_at ?? "").localeCompare(b.scheduled_at ?? ""))) {
      const card = cards.get(post.card_id);
      const outcome = card ? await publishOne(ctx, post, card, { live, explicit: !!opts.postIds?.length, fetchImpl: opts.fetchImpl, wait: opts.wait }, log) : "skipped";
      tally[outcome] += 1;
    }
    log.count("studio_posts", tally.posted + tally.dry_run + tally.failed + tally.by_hand + tally.postponed);
    log.note(Object.entries(tally).filter(([, n]) => n > 0).map(([k, n]) => `${n} ${k.replace("_", " ")}`).join(", ") || "nothing to do");
    log.details["tally"] = tally;
    return { outcome: !live && tally.dry_run > 0 && tally.posted === 0 ? ("dry_run" as const) : ("ok" as const) };
  });
}

/** One piece through every check, then through its client. */
export async function publishOne(ctx: AgentContext, post: PostRow, card: CardRow, o: { live: boolean; explicit: boolean; fetchImpl?: Fetch; wait?: (ms: number) => Promise<void> }, log: RunLog): Promise<PieceOutcome> {
  const { store, settings, now } = ctx;
  const outbox = settings.get("outbox");
  const label = `${PLATFORM_LABELS[post.platform]} ${FORMAT_LABELS[post.format].toLowerCase()}`;
  const ready = post.status === "rendered" || (post.status === "approved" && mediaNeed(post) === null) || retryDue(post, now, outbox);
  if (!ready) return "skipped";
  if (!post.scheduled_at) return "skipped";
  if (ctx.ownerId && post.approved_by !== ctx.ownerId) {
    await fail(ctx, post, "approved by someone other than the owner: approve it again on Today", { final: true });
    log.note(`${label}: not approved by the owner`);
    return "failed";
  }
  const slot = new Date(post.scheduled_at);
  if (!o.explicit && slot.getTime() < now.getTime() - LATE_HOURS * 3600_000) {
    await fail(ctx, post, `missed its slot (${describeParis(slot)}) by more than ${LATE_HOURS} hours: reschedule it on Today`, { final: true });
    log.note(`${label}: missed its slot`);
    return "failed";
  }
  if (!settings.platform(post.platform).enabled) {
    log.note(`${label}: ${PLATFORM_LABELS[post.platform]} is turned off in Settings`);
    return "skipped";
  }

  const mode = settings.postingMode(post.platform);
  if (mode === "by_hand") return queueByHand(ctx, post, label, log);

  const windowEnd = now.getTime() + outbox.window_minutes * 60_000;
  if (!o.explicit && slot.getTime() > windowEnd) return "skipped";
  if (settings.get("global").scheduling_mode === "confirm" && !post.confirmed_at && !o.explicit) {
    log.note(`${label} at ${parisTime(slot)}: waiting for the owner's confirmation on Today`);
    return "waiting";
  }
  if (VIDEO_FORMATS.has(post.format)) {
    const gap = outbox.video_gap_hours * 3600_000;
    const recent = (await store.posts({ platforms: [post.platform], statuses: ["posted", "queued"], postedFrom: new Date(now.getTime() - gap).toISOString() })).filter(
      (p) => p.id !== post.id && VIDEO_FORMATS.has(p.format) && p.posted_at,
    );
    const last = recent.map((p) => Date.parse(p.posted_at ?? "")).sort((a, b) => b - a)[0];
    if (last !== undefined && now.getTime() - last < gap) {
      const later = new Date(last + gap);
      await store.updatePosts([post.id], { scheduled_at: later.toISOString() }, "publish");
      await store.logEvent({ table: "studio_posts", rowId: post.id, actor: "publish", note: `moved to ${describeParis(later)}: another video went out on ${PLATFORM_LABELS[post.platform]} less than ${outbox.video_gap_hours} hours ago` });
      log.note(`${label}: postponed to ${parisTime(later)} (video gap)`);
      return "postponed";
    }
  }

  const writes = mayWrite(post, ctx.ownerId, o.live);
  const made = await publishClientFor(store, post.platform, { kit: ctx.kit, settings, live: writes, now, fetchImpl: o.fetchImpl, wait: o.wait });
  if ("error" in made) {
    await fail(ctx, post, made.error);
    log.note(`${label}: ${made.error}`);
    return "failed";
  }
  await store.updatePosts([post.id], { status: "queued" }, "publish");
  const media = await store.media({ postIds: [post.id] });
  const input: PublishInput = {
    post,
    card,
    media,
    signedUrl: (path) => ctx.storage.signedUrl(path, SIGNED_URL_SECONDS),
    download: (path) => ctx.storage.download(path),
  };
  try {
    const done = await made.client.publish(input);
    const requests = made.http.recorded;
    if (done.state?.["inbox"] === true || mode === "inbox") {
      // TikTok's inbox: the video is on the owner's phone; they finish and post it in the app.
      await store.updatePosts([post.id], { status: "queued", platform_post_id: done.id, platform_state: { ...done.state, stage: "inbox", requests } }, "publish");
      await store.logEvent({ table: "outbox", rowId: post.id, actor: "publish", note: `sent to the TikTok inbox: ${excerpt(requests)}` });
      await byHandReminder(ctx, post, label, "Finish in TikTok: the video is in your TikTok inbox. Switch on the AI-generated label, post, then paste the address on Today.");
      return "by_hand";
    }
    await store.updatePosts([post.id], { status: "posted", platform_post_id: done.id, platform_url: done.url, posted_at: now.toISOString(), error: null, platform_state: { ...(done.state ?? {}), stage: "posted", requests: requests.length } }, "publish");
    await store.logEvent({ table: "outbox", rowId: post.id, actor: "publish", note: `${mode === "postly" ? "handed to Postly" : "posted"} ${done.url ?? done.id}: ${excerpt(requests)}` });
    log.note(`${label}: ${mode === "postly" ? "handed to Postly" : "posted"} ${done.url ?? done.id}`);
    return "posted";
  } catch (err) {
    if (err instanceof DryRunStop) {
      const requests = made.http.recorded;
      await store.updatePosts(
        [post.id],
        { status: "posted", platform_post_id: `${DRY_RUN_PREFIX}${post.id}`, platform_url: null, posted_at: now.toISOString(), error: null, platform_state: { stage: "posted", dry_run: true, requests } },
        "publish",
      );
      await store.logEvent({ table: "outbox", rowId: post.id, actor: "publish", note: `dry run, would send: ${excerpt(requests)}` });
      log.note(`${label}: dry run (${err.request.method} ${err.request.url})`);
      return "dry_run";
    }
    const message = err instanceof PlatformError ? `${err.message}` : err instanceof Error ? err.message : String(err);
    await fail(ctx, post, message, { requests: made.http.recorded });
    await store.logEvent({ table: "outbox", rowId: post.id, actor: "publish", note: `failed: ${message.slice(0, 500)} — ${excerpt(made.http.recorded, 1500)}` });
    log.note(`${label}: failed (${message.slice(0, 200)})`);
    return "failed";
  }
}

async function fail(ctx: AgentContext, post: PostRow, error: string, o: { final?: boolean; requests?: readonly RecordedRequest[] } = {}): Promise<void> {
  const outbox = ctx.settings.get("outbox");
  await ctx.store.updatePosts(
    [post.id],
    {
      status: "failed",
      error,
      // A final failure is past its retries: the owner decides (reschedule, re-approve).
      retries: o.final ? outbox.max_retries + 1 : post.retries + 1,
      platform_state: { ...(post.platform_state ?? {}), stage: "publish", last_attempt: ctx.now.toISOString(), ...(o.requests ? { requests: o.requests } : {}) },
    },
    "publish",
  );
}

async function queueByHand(ctx: AgentContext, post: PostRow, label: string, log: RunLog): Promise<PieceOutcome> {
  await ctx.store.updatePosts([post.id], { status: "queued", platform_state: { ...(post.platform_state ?? {}), stage: "by_hand" } }, "publish");
  await byHandReminder(ctx, post, label, "Download it and copy the caption on Today, post it, then paste its address.");
  log.note(`${label}: queued for the owner to post by hand`);
  return "by_hand";
}

async function byHandReminder(ctx: AgentContext, post: PostRow, label: string, how: string): Promise<void> {
  const kind = ctx.settings.get("reminders").kinds["by-hand-post"];
  if (!kind.on || !post.scheduled_at) return;
  const slot = new Date(post.scheduled_at);
  const due = new Date(Math.max(ctx.now.getTime(), slot.getTime() - BY_HAND_LEAD_MINUTES * 60_000));
  const lead = (post.caption ?? post.title ?? "").replace(/\s+/g, " ").slice(0, 140);
  await ctx.store.insertReminder({
    kind: "by-hand-post",
    title: `Post by hand: ${label} at ${parisTime(slot)}`,
    body: `${how}${lead ? `\n\n“${lead}${lead.length >= 140 ? "…" : ""}”` : ""}`,
    due_at: due.toISOString(),
    channels: kind.channels,
    linked_table: "studio_posts",
    linked_id: post.id,
    link: `/studio/today?piece=${post.id}`,
    created_by: "publish",
    dedupe_key: `by-hand:${post.id}`,
  });
}

/** How long Postly may keep a piece queued before the owner is asked to look. */
const POSTLY_PATIENCE_HOURS = 12;

/**
 * Postly answers "enqueued", not "posted". Each run reads its activity for the pieces handed to it in
 * the last two days: a delivered one gets its address, a failed one becomes a failed piece with
 * Postly's reason, and one still waiting after twelve hours is set aside for the owner, so nothing
 * stays marked posted that never went out.
 */
export async function confirmPostly(ctx: AgentContext, log: RunLog, fetchImpl?: Fetch): Promise<void> {
  const apiKey = (process.env.POSTLY_API_KEY ?? "").trim();
  if (!apiKey) return;
  const since = new Date(ctx.now.getTime() - 48 * 3600_000);
  const open = (await ctx.store.posts({ statuses: ["posted"], postedFrom: since.toISOString(), limit: 500 })).filter((p) => isPostlyId(p.platform_post_id) && stateOf(p)["postly_confirmed"] !== true);
  if (!open.length) return;
  let deliveries;
  try {
    deliveries = await postlyDeliveries(new Http(false, fetchImpl), apiKey, since, new Date(ctx.now.getTime() + 60_000));
  } catch (err) {
    log.note(`Postly's activity could not be read: ${err instanceof Error ? err.message : String(err)}`);
    return;
  }
  const byId = new Map(deliveries.map((d) => [d.postId, d]));
  for (const p of open) {
    const d = byId.get(String(stateOf(p)["postly_post_id"] ?? ""));
    const label = `${PLATFORM_LABELS[p.platform]} ${FORMAT_LABELS[p.format].toLowerCase()}`;
    if (d?.state === "published") {
      await ctx.store.updatePosts([p.id], { platform_url: d.url ?? p.platform_url, platform_state: { ...stateOf(p), postly_confirmed: true } }, "publish");
      log.note(`${label}: Postly delivered it${d.url ? ` (${d.url})` : ""}`);
    } else if (d?.state === "failed") {
      await fail(ctx, p, `Postly: ${d.reason ?? "the delivery failed"}`, { final: true });
      await ctx.store.logEvent({ table: "outbox", rowId: p.id, actor: "publish", note: `Postly reports the delivery failed: ${d.reason ?? "no reason given"}` });
      log.note(`${label}: Postly's delivery failed`);
    } else if (p.posted_at && ctx.now.getTime() - Date.parse(p.posted_at) > POSTLY_PATIENCE_HOURS * 3600_000) {
      await fail(ctx, p, `Postly hasn't delivered it after ${POSTLY_PATIENCE_HOURS} hours: check Postly's publishing queue, then decide here`, { final: true });
      log.note(`${label}: still waiting at Postly after ${POSTLY_PATIENCE_HOURS} hours`);
    }
  }
}

/**
 * A piece left `queued` for an hour by a run that stopped mid-call may or may not be on the platform:
 * it is failed with no automatic retry, so it can't go out twice; the owner checks and decides.
 */
export async function settleStale(ctx: AgentContext, log: RunLog): Promise<number> {
  const hourAgo = ctx.now.getTime() - 3600_000;
  const stale = (await ctx.store.posts({ statuses: ["queued"], limit: 200 })).filter((p) => {
    const stage = stateOf(p).stage;
    return stage !== "by_hand" && stage !== "inbox" && Date.parse(p.updated_at) < hourAgo;
  });
  for (const p of stale) await fail(ctx, p, "the outbox stopped while posting this: check the platform before posting it again", { final: true });
  if (stale.length) log.note(`${stale.length} pieces left half-posted were set aside for the owner`);
  return stale.length;
}

/** Settings → Connections → Test in dry run: a real piece (or a sample) through the client, stopped at the first write. */
export async function testConnection(ctx: AgentContext, platform: Platform, fetchImpl?: Fetch): Promise<{ ok: boolean; requests: readonly RecordedRequest[]; message: string }> {
  const { store } = ctx;
  const made = await publishClientFor(store, platform, { kit: ctx.kit, settings: ctx.settings, live: false, now: ctx.now, fetchImpl });
  if ("error" in made) return { ok: false, requests: [], message: made.error };
  const sample = (await store.posts({ platforms: [platform], statuses: ["rendered", "approved", "posted"], limit: 1 }))[0];
  const post: PostRow = sample ?? samplePost(platform, ctx.now);
  const card = (await store.cards({ ids: [post.card_id] }))[0] ?? sampleCard(post.card_id, ctx.now);
  const media = sample ? await store.media({ postIds: [post.id] }) : [];
  try {
    await made.client.publish({ post, card, media, signedUrl: (p) => ctx.storage.signedUrl(p, 3600), download: (p) => ctx.storage.download(p) });
    return { ok: false, requests: made.http.recorded, message: "the client finished without a write: nothing would have been posted" };
  } catch (err) {
    if (err instanceof DryRunStop) {
      await store.logEvent({ table: "outbox", rowId: post.id, actor: "owner", note: `test in dry run (${platform}): ${excerpt(made.http.recorded)}` });
      return { ok: true, requests: made.http.recorded, message: `connected; it would send ${err.request.method} ${err.request.url}` };
    }
    return { ok: false, requests: made.http.recorded, message: err instanceof Error ? err.message : String(err) };
  }
}

function samplePost(platform: Platform, now: Date): PostRow {
  const at = now.toISOString();
  return {
    id: "00000000-0000-4000-8000-000000000000",
    card_id: "00000000-0000-4000-8000-000000000001",
    platform,
    format: "text",
    language: "en",
    script: null,
    lines: null,
    caption: "A test from the Studio, in dry run: nothing is posted.",
    title: "A test from the Studio",
    description: "A test from the Studio, in dry run: nothing is posted.",
    tags: [],
    slides: null,
    spec: null,
    disclosure: false,
    scheduled_at: at,
    status: "rendered",
    gate: null,
    by_hand: false,
    platform_post_id: null,
    platform_url: null,
    platform_state: null,
    posted_at: null,
    error: null,
    retries: 0,
    approved_at: at,
    approved_by: null,
    confirmed_at: null,
    run_id: null,
    updated_by: "owner",
    created_at: at,
    updated_at: at,
  };
}

function sampleCard(id: string, now: Date): CardRow {
  const at = now.toISOString();
  return {
    id,
    week: "",
    pillar: "test",
    language: "en",
    idea: "A dry-run test",
    hook: "A test from the Studio",
    points: [],
    figures: [],
    cta: "test",
    anchor: null,
    sky_date: null,
    formats: [],
    src: null,
    kit_version: 1,
    prompt_version: 1,
    parent: null,
    hook_id: null,
    status: "approved",
    reason: null,
    run_id: null,
    created_by: "owner",
    approved_at: at,
    approved_by: null,
    updated_by: "owner",
    created_at: at,
    updated_at: at,
  };
}
