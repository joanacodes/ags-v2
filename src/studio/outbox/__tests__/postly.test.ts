/** Postly as a posting route: the guard, the requests it builds, and what becomes of its deliveries. */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { MemoryStore, MemoryStorage } from "../../store/memory";
import { defaultKit } from "../../kit/load";
import { StudioSettings } from "../../settings";
import type { AgentContext } from "../../agents/context";
import type { PostRow } from "../../store/rows";
import type { Platform } from "../../types";
import { runPublish, testConnection } from "../publish";
import { isPostlyId, postlyDeliveries, POSTLY_API } from "../postly";
import { publishClientFor } from "../registry";
import { Http } from "../http";
import { NOW } from "./fixtures";
import { fakeNetwork, type Call } from "./network";

const kit = defaultKit();
const OWNER = "owner-uuid";
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const noWait = async () => undefined;

const POSTLY = {
  global: { scheduling_mode: "direct" },
  postly: { workspace_id: "ws1", workspace_name: "The Astro Study", channels: { tiktok: { id: "ch-tt", name: "@astrostudy" }, youtube: { id: "ch-yt", name: "The Astro Study" }, pinterest: { id: "ch-pin", name: "astrostudy" }, threads: { id: "ch-th", name: "@astrostudy" } } },
  "platform-tiktok": { mode: "postly" },
  "platform-youtube": { mode: "postly" },
  "platform-pinterest": { mode: "postly" },
  "platform-threads": { mode: "postly" },
};

function ctx(store: MemoryStore, stored: Record<string, Record<string, unknown>> = POSTLY, now = NOW): AgentContext {
  return { store, storage: new MemoryStorage(), transport: null, kit, kitVersion: 1, settings: new StudioSettings(stored), now, trigger: "manual", ownerId: OWNER, dryRun: true };
}

let saved: string | undefined;
before(() => {
  saved = process.env.POSTLY_API_KEY;
  process.env.POSTLY_API_KEY = "pk_test";
});
after(() => {
  if (saved === undefined) delete process.env.POSTLY_API_KEY;
  else process.env.POSTLY_API_KEY = saved;
});

async function piece(store: MemoryStore, platform: Platform, format: PostRow["format"], over: Partial<PostRow> = {}): Promise<PostRow> {
  const [card] = await store.insertCards([{ week: "2026-W46", pillar: "test", language: "en", idea: "Three statements", hook: "Could you pick your own chart?", points: [], figures: [], cta: "test", formats: [format] }], "strategist");
  const [p] = await store.insertPosts(
    [{ card_id: card!.id, platform, format, language: "en", caption: "Three statements. One is from your chart. #astrology", title: "Could you pick your own chart?", description: "Three statements, one from your chart.", tags: ["#astrology", "#birthchart"], status: "rendered", scheduled_at: new Date(NOW.getTime() + 5 * 60_000).toISOString(), disclosure: format === "video", spec: { link: "https://astrostudy.co.uk/test/?src=pin" } }],
    "writer-en",
  );
  await store.updatePosts([p!.id], { approved_by: OWNER, approved_at: NOW.toISOString(), ...over }, "owner");
  if (format === "video") {
    await store.insertMedia({ post_id: p!.id, kind: "video", path: `w/${p!.id}.mp4`, bytes: 2048, duration_ms: 30000, width: 1080, height: 1920, sha256: null, meta: {} });
    await store.insertMedia({ post_id: p!.id, kind: "thumbnail", path: `w/${p!.id}.jpg`, bytes: 512, duration_ms: null, width: 1080, height: 1920, sha256: null, meta: {} });
  }
  if (format === "pin") await store.insertMedia({ post_id: p!.id, kind: "image", path: `w/${p!.id}.png`, bytes: 512, duration_ms: null, width: 1000, height: 1500, sha256: null, meta: {} });
  return (await store.posts({ ids: [p!.id] }))[0]!;
}

const one = async (store: MemoryStore, id: string) => (await store.posts({ ids: [id] }))[0]!;

/** Postly as its documentation describes it: uploads may finish later (202), posts are enqueued. */
function postlyNetwork() {
  let posts = 0;
  const statusAsked = new Map<string, number>();
  return fakeNetwork((c: Call) => {
    const u = new URL(c.url);
    if (u.host !== "openapi.postly.ai") return null;
    if (u.pathname === "/v1/files/upload-from-url") {
      const key = c.headers["idempotency-key"] ?? "";
      // Videos take a moment: Postly answers 202 and the status call finishes it.
      if (String((c.body as { file_name?: string }).file_name).endsWith(".mp4")) return json({ code: 202, data: { status: "processing", idempotency_key: key, retry_after_seconds: 5 } }, 202);
      return json({ code: 200, data: { url: `https://files.postly.ai/${key}.png`, type: "image/png" } });
    }
    if (u.pathname === "/v1/files/upload-status") {
      const key = (c.body as { idempotency_key: string }).idempotency_key;
      const n = (statusAsked.get(key) ?? 0) + 1;
      statusAsked.set(key, n);
      return n < 2 ? json({ data: { status: "processing", retry_after_seconds: 5 } }, 202) : json({ data: { url: `https://files.postly.ai/${key}.mp4`, type: "video/mp4", status: "completed" } });
    }
    if (u.pathname === "/v1/posts" && c.method === "POST") return json({ code: 200, message: "Post enqueued successfully", data: { _id: `pp${++posts}` } });
    return json({ code: 404 }, 404);
  });
}

test("dry run through Postly: the first upload is recorded and stopped, nothing reaches Postly", async () => {
  const store = new MemoryStore();
  const tt = await piece(store, "tiktok", "video");
  const net = postlyNetwork();
  const result = await runPublish(ctx(store), { live: false, fetchImpl: net.fetch, wait: noWait });
  assert.equal(result.outcome, "dry_run", result.error ?? "");
  const after = await one(store, tt.id);
  assert.equal(after.status, "posted");
  assert.ok(after.platform_post_id?.startsWith("dry-run:"));
  const requests = (after.platform_state as { requests: { method: string; url: string; body: unknown }[] }).requests;
  assert.equal(requests[0]?.url, `${POSTLY_API}/files/upload-from-url`);
  assert.equal(net.calls.filter((c) => c.method !== "GET").length, 0, "no write reached the network");
});

test("live through Postly: the video is stored, then posted public on TikTok with the AI label", async () => {
  const store = new MemoryStore();
  const tt = await piece(store, "tiktok", "video");
  const net = postlyNetwork();
  const result = await runPublish(ctx(store), { live: true, fetchImpl: net.fetch, wait: noWait });
  assert.equal(result.outcome, "ok", result.error ?? "");
  const after = await one(store, tt.id);
  assert.equal(after.status, "posted");
  assert.ok(isPostlyId(after.platform_post_id));
  const post = net.calls.find((c) => c.url === `${POSTLY_API}/posts`)!;
  assert.equal(post.headers["x-api-key"], "pk_test");
  const b = post.body as { workspace: string; target_platforms: string; text: string; media: { url: string }[]; platform_posts: { identifier: string; settings: Record<string, unknown> }[] };
  assert.equal(b.workspace, "ws1");
  assert.equal(b.target_platforms, "ch-tt");
  assert.equal(b.text, "Three statements. One is from your chart. #astrology");
  assert.match(b.media[0]!.url, /\.mp4$/);
  assert.deepEqual(b.platform_posts[0], { identifier: "tiktok", settings: { identifier: "tiktok", privacy_level: "PUBLIC_TO_EVERYONE", is_aigc: true, title: "Could you pick your own chart?" } });
  // the upload finished through the status call, under the same idempotency key
  const uploads = net.calls.filter((c) => c.url.startsWith(`${POSTLY_API}/files/`));
  assert.deepEqual(uploads.map((c) => c.url.slice(POSTLY_API.length)), ["/files/upload-from-url", "/files/upload-status", "/files/upload-status"]);
});

test("YouTube through Postly gets its title, description, tags, public privacy and the thumbnail", async () => {
  const store = new MemoryStore();
  await piece(store, "youtube", "video");
  const net = postlyNetwork();
  await runPublish(ctx(store), { live: true, fetchImpl: net.fetch, wait: noWait });
  const post = net.calls.find((c) => c.url === `${POSTLY_API}/posts`)!;
  const s = (post.body as { platform_posts: { settings: Record<string, unknown> }[] }).platform_posts[0]!.settings;
  assert.equal(s["privacy"], "Public");
  assert.equal(s["title"], "Could you pick your own chart?");
  assert.equal(s["description"], "Three statements, one from your chart.");
  assert.deepEqual(s["tags"], ["astrology", "birthchart"]);
  assert.match(String(s["thumbnail_url"]), /\.png$/);
});

test("a pin through Postly links to the test page; a Threads text post sends no file", async () => {
  const store = new MemoryStore();
  await piece(store, "pinterest", "pin");
  await piece(store, "threads", "text");
  const net = postlyNetwork();
  await runPublish(ctx(store), { live: true, fetchImpl: net.fetch, wait: noWait });
  const posts = net.calls.filter((c) => c.url === `${POSTLY_API}/posts`).map((c) => c.body as { target_platforms: string; media?: unknown[]; platform_posts: { settings: Record<string, unknown> }[] });
  const pin = posts.find((p) => p.target_platforms === "ch-pin")!;
  assert.equal(pin.platform_posts[0]!.settings["destination_url"], "https://astrostudy.co.uk/test/?src=pin");
  const th = posts.find((p) => p.target_platforms === "ch-th")!;
  assert.equal(th.media, undefined);
});

test("Postly chosen but not set up says what is missing; other networks keep their own client", async () => {
  const store = new MemoryStore();
  const env = { kit, live: false, now: NOW };
  const noKey = process.env.POSTLY_API_KEY;
  delete process.env.POSTLY_API_KEY;
  const r1 = await publishClientFor(store, "tiktok", { ...env, settings: new StudioSettings(POSTLY) });
  assert.deepEqual(r1, { error: "Postly is chosen but its key isn't set: paste it in Settings → Keys" });
  process.env.POSTLY_API_KEY = noKey;
  const r2 = await publishClientFor(store, "x", { ...env, settings: new StudioSettings({ ...POSTLY, "platform-x": { mode: "postly", enabled: true } }) });
  assert.deepEqual(r2, { error: "Postly has no x channel picked: Settings → Connections → Postly" });
  const r3 = await publishClientFor(store, "mastodon", { ...env, settings: new StudioSettings({ ...POSTLY, "platform-mastodon": { mode: "postly" } }) });
  assert.ok("error" in r3 && /Mastodon|mastodon/.test(r3.error) && !/Postly/.test(r3.error), "Postly can't post to Mastodon: its own client is used");
});

test("Test in dry run through Postly logs the post it would send", async () => {
  const store = new MemoryStore();
  const r = await testConnection(ctx(store), "threads", postlyNetwork().fetch);
  assert.equal(r.ok, true, r.message);
  assert.equal(r.requests[0]?.url, `${POSTLY_API}/posts`);
});

test("Postly's activity: delivered pieces get their address, failed ones fail, stuck ones are set aside", async () => {
  const store = new MemoryStore();
  const delivered = await piece(store, "tiktok", "video");
  const failedOne = await piece(store, "youtube", "video");
  const stuck = await piece(store, "pinterest", "pin");
  const fresh = await piece(store, "threads", "text");
  const posted = (id: string, postlyId: string, hoursAgo: number) =>
    store.updatePosts([id], { status: "posted", platform_post_id: `postly:${postlyId}`, posted_at: new Date(NOW.getTime() - hoursAgo * 3600_000).toISOString(), platform_state: { stage: "posted", postly_post_id: postlyId } }, "publish");
  await posted(delivered.id, "pp1", 2);
  await posted(failedOne.id, "pp2", 2);
  await posted(stuck.id, "pp3", 13);
  await posted(fresh.id, "pp4", 1);
  const net = fakeNetwork((c) => {
    if (!c.url.startsWith(`${POSTLY_API}/posts/activity`)) return null;
    return json({
      code: 200,
      data: {
        posts: [
          { post_id: "pp1", published: true, published_deliveries: [{ platform: "tiktok", url: "https://www.tiktok.com/@astrostudy/video/1" }], failed_deliveries: [] },
          { post_id: "pp2", failed: true, published_deliveries: [], failed_deliveries: [{ platform: "youtube", error: "The video is too long for a Short" }] },
          { post_id: "pp3", effective_status: "queued", published_deliveries: [], failed_deliveries: [] },
          { post_id: "pp4", effective_status: "queued", published_deliveries: [], failed_deliveries: [] },
        ],
      },
    });
  });
  // a run with nothing due still checks on Postly
  await runPublish(ctx(store), { live: true, fetchImpl: net.fetch, wait: noWait });
  const d = await one(store, delivered.id);
  assert.equal(d.platform_url, "https://www.tiktok.com/@astrostudy/video/1");
  assert.equal((d.platform_state as { postly_confirmed?: boolean }).postly_confirmed, true);
  const f = await one(store, failedOne.id);
  assert.equal(f.status, "failed");
  assert.equal(f.error, "Postly: The video is too long for a Short");
  assert.equal((await one(store, stuck.id)).status, "failed");
  assert.equal((await one(store, fresh.id)).status, "posted");
});

test("the activity reader pages through Postly's answers", async () => {
  let asked = 0;
  const net = fakeNetwork((c) => {
    if (!c.url.startsWith(`${POSTLY_API}/posts/activity`)) return null;
    asked++;
    const skip = Number(new URL(c.url).searchParams.get("skip"));
    const posts = Array.from({ length: skip === 0 ? 100 : 3 }, (_, i) => ({ post_id: `p${skip + i}`, published: true, published_deliveries: [] }));
    return json({ data: { posts } });
  });
  const all = await postlyDeliveries(new Http(false, net.fetch), "pk", new Date(NOW.getTime() - 3600_000), NOW);
  assert.equal(all.length, 103);
  assert.equal(asked, 2);
  assert.ok(all.every((d) => d.state === "published" && d.url === null));
});
