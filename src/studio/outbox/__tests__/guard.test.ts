/**
 * The draft-only guard, proven for every client: with a dry Http, publishing and replying stop at the
 * first write, the write is recorded, and nothing but reads and sign-ins ever reaches the network.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { AUTH_ENDPOINT, DryRunStop, Http, READ_ONLY_POST } from "../http";
import { buildClient, mayWrite } from "../registry";
import { CONNECTION_OF, type ClientDeps, type Token } from "../types";
import { defaultKit } from "../../kit/load";
import { StudioSettings } from "../../settings";
import type { Platform } from "../../types";
import type { ReplyRow } from "../../store/rows";
import { fakeNetwork, type Call } from "./network";
import { card, mediaFor, NOW, post, TOKENS } from "./fixtures";
import { facetsOf } from "../bluesky";

const API_PLATFORMS: Platform[] = ["instagram", "facebook", "threads", "youtube", "pinterest", "bluesky", "mastodon", "x", "tiktok"];
const kit = defaultKit();

function deps(platform: Platform, http: Http, saved: Token[] = []): ClientDeps {
  const key = CONNECTION_OF[platform] ?? platform;
  return { http, token: TOKENS[key]!, saveToken: async (t) => void saved.push(t) };
}

const onlyReads = (calls: readonly Call[]) => calls.filter((c) => c.method !== "GET" && !AUTH_ENDPOINT.test(new URL(c.url).pathname) && !READ_ONLY_POST.test(new URL(c.url).pathname));

function input(platform: Platform) {
  const p = post(platform);
  return { post: p, card: card(), media: mediaFor(p), signedUrl: async (path: string) => `https://storage.example/${path}?token=signed`, download: async () => new Uint8Array(2048) };
}

for (const platform of API_PLATFORMS) {
  test(`${platform}: a dry publish stops at its first write and sends no write`, async () => {
    const net = fakeNetwork();
    const http = new Http(false, net.fetch);
    for (const mode of platform === "tiktok" ? (["inbox", "api"] as const) : (["api"] as const)) {
      const settings = new StudioSettings(platform === "tiktok" ? { "platform-tiktok": { mode } } : {});
      const client = buildClient(platform, deps(platform, http), { kit, settings });
      assert.ok(client, `${platform} has a client`);
      await assert.rejects(client.publish(input(platform)), (err: unknown) => err instanceof DryRunStop);
    }
    assert.deepEqual(onlyReads(net.calls), [], `writes reached the network: ${JSON.stringify(onlyReads(net.calls))}`);
    assert.ok(http.recorded.length >= 1, "the write it would have made is recorded");
    assert.ok(http.recorded.every((r) => r.method !== "GET"));
    assert.ok(http.recorded.every((r) => !/access_token=(?!…)/.test(r.url)), "no token in the recorded address");
  });
}

for (const platform of ["instagram", "facebook", "threads", "youtube", "bluesky", "mastodon", "x"] as Platform[]) {
  test(`${platform}: a dry reply stops before it is sent`, async () => {
    const net = fakeNetwork();
    const http = new Http(false, net.fetch);
    const client = buildClient(platform, deps(platform, http), { kit, settings: new StudioSettings({}) });
    assert.ok(client?.reply, `${platform} can reply`);
    const reply: ReplyRow = {
      id: "reply-1", platform, thread_ref: platform === "bluesky" ? "at://did:plc:fan/app.bsky.feed.post/3kreply" : "comment-1", parent_ref: null, post_id: null,
      author_handle: "fan", author_ref: "fan-1", their_text: "Where's the test?", their_lang: "en", received_at: NOW.toISOString(), klass: "question",
      draft_reply: "Here it is: https://astrostudy.co.uk/test/", flag: "none", flag_reason: null, status: "approved", sent_at: null, sent_ref: null,
      expires_at: NOW.toISOString(), updated_by: "owner", created_at: NOW.toISOString(), updated_at: NOW.toISOString(),
    };
    await assert.rejects(client.reply(reply, reply.draft_reply ?? ""), (err: unknown) => err instanceof DryRunStop);
    assert.deepEqual(onlyReads(net.calls), []);
  });
}

test("the guard: only STUDIO_LIVE with the owner's approval may write", () => {
  const p = post("threads");
  assert.equal(mayWrite(p, "owner-uuid", false), false, "STUDIO_LIVE off");
  assert.equal(mayWrite(p, null, true), false, "no owner id configured");
  assert.equal(mayWrite({ ...p, approved_by: "someone-else" }, "owner-uuid", true), false, "approved by someone else");
  assert.equal(mayWrite({ ...p, approved_by: null }, "owner-uuid", true), false, "never approved");
  assert.equal(mayWrite({ ...p, status: "killed" }, "owner-uuid", true), false, "killed");
  assert.equal(mayWrite(p, "owner-uuid", true), true);
});

test("sign-in and read-only POSTs can't be used to write", async () => {
  const net = fakeNetwork();
  const http = new Http(false, net.fetch);
  await assert.rejects(http.signIn("https://api.x.com/2/tweets", { json: { text: "hi" } }), /token endpoints only/);
  await assert.rejects(http.query("https://open.tiktokapis.com/v2/post/publish/video/init/", { json: {} }), /read-only endpoints only/);
  assert.equal(net.calls.length, 0);
});

test("live, with recorded answers: each client posts and says where", async () => {
  for (const platform of API_PLATFORMS) {
    const net = fakeNetwork();
    const http = new Http(true, net.fetch);
    const client = buildClient(platform, deps(platform, http), { kit, settings: new StudioSettings({ "platform-tiktok": { mode: "inbox" } }) });
    const done = await client!.publish(input(platform));
    assert.ok(done.id, `${platform} returned an id`);
    if (platform !== "tiktok") assert.ok(done.url?.startsWith("https://"), `${platform} returned an address: ${done.url}`);
  }
});

test("Bluesky: links and tags become facets at UTF-8 byte offsets", () => {
  const text = "Énergie lunaire : https://astrostudy.co.uk/fr/test/?src=bs. #astrologie";
  const facets = facetsOf(text);
  const bytes = new TextEncoder().encode(text);
  const slice = (f: (typeof facets)[number]) => new TextDecoder().decode(bytes.slice(f.index.byteStart, f.index.byteEnd));
  assert.equal(facets.length, 2);
  assert.equal(slice(facets[0]!), "https://astrostudy.co.uk/fr/test/?src=bs");
  assert.equal(slice(facets[1]!), "#astrologie");
});

test("Mastodon: a retried post carries the same idempotency key, so it can't double", async () => {
  const net = fakeNetwork();
  const http = new Http(true, net.fetch);
  const client = buildClient("mastodon", deps("mastodon", http), { kit, settings: new StudioSettings({}) });
  await client!.publish(input("mastodon"));
  await client!.publish(input("mastodon"));
  const keys = net.calls.filter((c) => c.url.endsWith("/api/v1/statuses")).map((c) => c.headers["idempotency-key"]);
  assert.equal(keys.length, 2);
  assert.equal(keys[0], keys[1]);
  assert.equal(keys[0], "studio-post-mastodon");
});

test("YouTube: every voiced video is declared as synthetic media", async () => {
  const net = fakeNetwork();
  const http = new Http(true, net.fetch);
  const client = buildClient("youtube", deps("youtube", http), { kit, settings: new StudioSettings({}) });
  await client!.publish(input("youtube"));
  const start = net.calls.find((c) => c.url.includes("uploadType=resumable"));
  const body = start?.body as { status?: { containsSyntheticMedia?: boolean; selfDeclaredMadeForKids?: boolean } };
  assert.equal(body.status?.containsSyntheticMedia, true);
  assert.equal(body.status?.selfDeclaredMadeForKids, false);
});
