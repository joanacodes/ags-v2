/** The publish worker, reply sending, the comment pull and the metrics worker, on the in-memory store. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { MemoryStore, MemoryStorage } from "../../store/memory";
import { defaultKit } from "../../kit/load";
import { StudioSettings } from "../../settings";
import type { AgentContext } from "../../agents/context";
import type { PostRow } from "../../store/rows";
import type { Platform } from "../../types";
import { runPublish, isDryRunId, LATE_HOURS } from "../publish";
import { sendReply, commentPull } from "../community";
import { saveToken } from "../tokens";
import { runMetrics } from "../../metrics/worker";
import { AUTH_ENDPOINT, READ_ONLY_POST } from "../http";
import { NOW, TOKENS } from "./fixtures";
import { fakeNetwork, type Call } from "./network";
import type { ConnectionKey } from "../types";

const kit = defaultKit();
const OWNER = "owner-uuid";

function ctx(store: MemoryStore, stored: Record<string, Record<string, unknown>> = {}, now = NOW): AgentContext {
  return { store, storage: new MemoryStorage(), transport: null, kit, kitVersion: 1, settings: new StudioSettings(stored), now, trigger: "manual", ownerId: OWNER, dryRun: true };
}

const DIRECT = { global: { scheduling_mode: "direct" } };
const writes = (calls: readonly Call[]) => calls.filter((c) => c.method !== "GET" && !AUTH_ENDPOINT.test(new URL(c.url).pathname) && !READ_ONLY_POST.test(new URL(c.url).pathname));

async function world() {
  const store = new MemoryStore();
  for (const [key, token] of Object.entries(TOKENS)) await saveToken(store, key as ConnectionKey, token, NOW);
  const [card] = await store.insertCards([{ week: "2026-W46", pillar: "test", language: "en", idea: "Three statements", hook: "Could you pick your own chart?", points: [], figures: [], cta: "test", formats: ["text", "video"] }], "strategist");
  return { store, card: card! };
}

async function piece(store: MemoryStore, cardId: string, platform: Platform, over: Partial<PostRow> = {}): Promise<PostRow> {
  const format = over.format ?? (platform === "tiktok" || platform === "instagram" ? "video" : "text");
  const [p] = await store.insertPosts(
    [{ card_id: cardId, platform, format, language: "en", caption: "Three statements. One is from your chart. #astrology", title: "Could you pick your own chart?", tags: ["#astrology"], status: "rendered", scheduled_at: new Date(NOW.getTime() + 5 * 60_000).toISOString(), disclosure: format === "video" }],
    "writer-en",
  );
  const patch = { approved_by: OWNER, approved_at: NOW.toISOString(), ...over };
  await store.updatePosts([p!.id], patch, "owner");
  if (format === "video") await store.insertMedia({ post_id: p!.id, kind: "video", path: `w/${p!.id}.mp4`, bytes: 2048, duration_ms: 30000, width: 1080, height: 1920, sha256: null, meta: {} });
  return (await store.posts({ ids: [p!.id] }))[0]!;
}

const one = async (store: MemoryStore, id: string) => (await store.posts({ ids: [id] }))[0]!;

test("dry run: the piece is marked posted with a dry-run id, the request is logged, nothing is written", async () => {
  const { store, card } = await world();
  const th = await piece(store, card.id, "threads");
  const bs = await piece(store, card.id, "bluesky");
  const net = fakeNetwork();
  const result = await runPublish(ctx(store, DIRECT), { live: false, fetchImpl: net.fetch });
  assert.equal(result.outcome, "dry_run", result.error ?? "");
  for (const p of [th, bs]) {
    const after = await one(store, p.id);
    assert.equal(after.status, "posted");
    assert.ok(isDryRunId(after.platform_post_id));
  }
  assert.deepEqual(writes(net.calls), []);
  const events = await store.events({ table: "outbox" });
  assert.equal(events.length, 2);
  assert.ok(events.every((e) => e.note?.startsWith("dry run, would send:")));
  assert.ok(events.some((e) => e.note?.includes("graph.threads.net")));
});

test("confirm mode: a piece waits for the owner's second tap", async () => {
  const { store, card } = await world();
  const waiting = await piece(store, card.id, "threads", { confirmed_at: null });
  const confirmed = await piece(store, card.id, "mastodon", { confirmed_at: NOW.toISOString() });
  await runPublish(ctx(store), { live: false, fetchImpl: fakeNetwork().fetch });
  assert.equal((await one(store, waiting.id)).status, "rendered");
  assert.equal((await one(store, confirmed.id)).status, "posted");
});

test("live: only the owner's approval sends; anyone else's fails the piece without a call", async () => {
  const { store, card } = await world();
  const mine = await piece(store, card.id, "threads");
  const theirs = await piece(store, card.id, "bluesky", { approved_by: "someone-else" });
  const net = fakeNetwork();
  await runPublish(ctx(store, DIRECT), { live: true, fetchImpl: net.fetch });
  const posted = await one(store, mine.id);
  assert.equal(posted.status, "posted");
  assert.equal(posted.platform_post_id, "th-post-1");
  assert.equal(posted.platform_url, "https://www.threads.net/@astrostudy/post/abc");
  const refused = await one(store, theirs.id);
  assert.equal(refused.status, "failed");
  assert.match(refused.error ?? "", /someone other than the owner/);
  assert.ok(!net.calls.some((c) => c.url.includes("bsky.social")), "Bluesky was never called");
});

test("by hand: TikTok is queued with a reminder half an hour before its slot", async () => {
  const { store, card } = await world();
  const tt = await piece(store, card.id, "tiktok", { scheduled_at: new Date(NOW.getTime() + 40 * 60_000).toISOString(), confirmed_at: null });
  const net = fakeNetwork();
  await runPublish(ctx(store), { live: true, fetchImpl: net.fetch });
  assert.equal((await one(store, tt.id)).status, "queued");
  assert.equal(net.calls.length, 0, "a by-hand piece makes no call");
  const reminders = await store.reminders({});
  assert.equal(reminders.length, 1);
  assert.equal(reminders[0]!.kind, "by-hand-post");
  assert.equal(reminders[0]!.due_at, new Date(NOW.getTime() + 10 * 60_000).toISOString());
  await runPublish(ctx(store), { live: true, fetchImpl: net.fetch });
  assert.equal((await store.reminders({})).length, 1, "never reminded twice");
});

test("two videos on one network within four hours: the second moves", async () => {
  const { store, card } = await world();
  const first = await piece(store, card.id, "instagram", { format: "video", scheduled_at: new Date(NOW.getTime() + 2 * 60_000).toISOString() });
  const second = await piece(store, card.id, "instagram", { format: "video", scheduled_at: new Date(NOW.getTime() + 8 * 60_000).toISOString() });
  await runPublish(ctx(store, DIRECT), { live: false, fetchImpl: fakeNetwork().fetch });
  assert.equal((await one(store, first.id)).status, "posted");
  const moved = await one(store, second.id);
  assert.equal(moved.status, "rendered");
  assert.equal(moved.scheduled_at, new Date(NOW.getTime() + 4 * 3600_000).toISOString());
});

test("a failed post is retried once after an hour, then left to the owner", async () => {
  const { store, card } = await world();
  const p = await piece(store, card.id, "mastodon");
  const down = fakeNetwork((c) => (c.method === "POST" && c.url.endsWith("/api/v1/statuses") ? new Response('{"error":"down"}', { status: 503 }) : null));
  await runPublish(ctx(store, DIRECT), { live: true, fetchImpl: down.fetch });
  let after = await one(store, p.id);
  assert.equal(after.status, "failed");
  assert.equal(after.retries, 1);
  const half = new Date(NOW.getTime() + 30 * 60_000);
  await runPublish(ctx(store, DIRECT, half), { live: true, fetchImpl: down.fetch });
  assert.equal((await one(store, p.id)).retries, 1, "not retried before the hour");
  const hour = new Date(NOW.getTime() + 61 * 60_000);
  await runPublish(ctx(store, DIRECT, hour), { live: true, fetchImpl: down.fetch });
  after = await one(store, p.id);
  assert.equal(after.retries, 2);
  const twoHours = new Date(NOW.getTime() + 125 * 60_000);
  const result = await runPublish(ctx(store, DIRECT, twoHours), { live: true, fetchImpl: fakeNetwork().fetch });
  assert.equal(result.outcome, "skipped", "past its retries, nothing is due");
  assert.equal((await one(store, p.id)).status, "failed");
});

test("a missed slot is not posted late, and a half-posted piece is set aside", async () => {
  const { store, card } = await world();
  const late = await piece(store, card.id, "threads", { scheduled_at: new Date(NOW.getTime() - (LATE_HOURS + 1) * 3600_000).toISOString() });
  const half = await piece(store, card.id, "bluesky", { status: "queued", platform_state: { stage: "publish" } });
  await runPublish(ctx(store, DIRECT), { live: false, fetchImpl: fakeNetwork().fetch });
  assert.match((await one(store, late.id)).error ?? "", /missed its slot/);
  const aside = await one(store, half.id);
  assert.equal(aside.status, "failed");
  assert.match(aside.error ?? "", /check the platform/);
});

test("the kill switch stops the outbox", async () => {
  const { store, card } = await world();
  const p = await piece(store, card.id, "threads");
  const result = await runPublish(ctx(store, { global: { paused: true, scheduling_mode: "direct" } }), { live: true, fetchImpl: fakeNetwork().fetch });
  assert.equal(result.outcome, "skipped");
  assert.equal((await one(store, p.id)).status, "rendered");
});

test("a reply goes only on the owner's approval, and dry runs log instead of sending", async () => {
  const { store } = await world();
  const [r] = await store.insertReplies([{ platform: "mastodon", thread_ref: "status-9", their_text: "Where do I take the test?", received_at: NOW.toISOString(), author_handle: "fan@mastodon.social" }]);
  await store.updateReply(r!.id, { draft_reply: "Here: https://astrostudy.co.uk/test/?src=ma", status: "approved" }, "community");
  const refused = await sendReply(ctx(store), r!.id, { live: true, fetchImpl: fakeNetwork().fetch });
  assert.equal(refused.ok, false);
  await store.updateReply(r!.id, { status: "approved" }, "owner");
  const net = fakeNetwork();
  const dry = await sendReply(ctx(store), r!.id, { live: false, fetchImpl: net.fetch });
  assert.ok(dry.ok && dry.dryRun);
  assert.deepEqual(writes(net.calls), []);
  assert.equal((await store.replies({ ids: [r!.id] }))[0]!.status, "sent");
});

test("comments are pulled from real posts only, and mapped to their pieces", async () => {
  const { store, card } = await world();
  const real = await piece(store, card.id, "bluesky", { status: "posted", platform_post_id: "at://did:plc:astro/app.bsky.feed.post/3kabc", posted_at: NOW.toISOString() });
  await piece(store, card.id, "bluesky", { status: "posted", platform_post_id: `dry-run:x`, posted_at: NOW.toISOString() });
  const net = fakeNetwork((c) =>
    c.url.includes("listNotifications")
      ? Response.json({
          notifications: [
            { uri: "at://did:plc:fan/app.bsky.feed.post/3kr1", reason: "reply", author: { did: "did:plc:fan", handle: "fan.bsky.social" }, record: { text: "TEST", createdAt: NOW.toISOString(), reply: { root: { uri: "at://did:plc:astro/app.bsky.feed.post/3kabc" }, parent: { uri: "at://did:plc:astro/app.bsky.feed.post/3kabc" } } } },
            { uri: "at://did:plc:astro/app.bsky.feed.post/self", reason: "reply", author: { did: "did:plc:astro" }, record: { text: "my own", createdAt: NOW.toISOString() } },
          ],
        })
      : null,
  );
  const items = await commentPull(ctx(store), net.fetch)("bluesky", new Date(NOW.getTime() - 3600_000));
  assert.equal(items.length, 1);
  assert.equal(items[0]!.post_id, real.id);
});

test("metrics: running totals per piece, the keyword comments counted, dry-run posts skipped", async () => {
  const { store, card } = await world();
  const real = await piece(store, card.id, "bluesky", { status: "posted", platform_post_id: "at://did:plc:astro/app.bsky.feed.post/3kabc", posted_at: NOW.toISOString() });
  await piece(store, card.id, "threads", { status: "posted", platform_post_id: "dry-run:y", posted_at: NOW.toISOString() });
  await store.insertReplies([{ platform: "bluesky", thread_ref: "c1", their_text: "TEST", received_at: NOW.toISOString(), post_id: real.id }, { platform: "bluesky", thread_ref: "c2", their_text: "testing my patience", received_at: NOW.toISOString(), post_id: real.id }]);
  const result = await runMetrics(ctx(store, { "input-metrics": { stripe: false, mailerlite: false } }, new Date(NOW.getTime() + 3600_000)), { fetchImpl: fakeNetwork().fetch });
  assert.equal(result.outcome, "ok", result.error ?? "");
  const rows = await store.metrics({ from: "2026-11-01", to: "2026-12-01" });
  assert.equal(rows.length, 1);
  assert.equal(rows[0]!.post_id, real.id);
  assert.equal(rows[0]!.likes, 4);
  assert.equal(rows[0]!.shares, 1);
  assert.equal(rows[0]!.keyword_comments, 1, "'testing' isn't the keyword");
});
