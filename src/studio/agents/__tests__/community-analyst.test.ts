import { test } from "node:test";
import assert from "node:assert/strict";
import { MemoryStore, MemoryStorage } from "../../store/memory";
import { defaultKit } from "../../kit/load";
import { StudioSettings } from "../../settings";
import { enforceReplyRules, runCommunity } from "../community";
import { runAnalyst } from "../analyst";
import { computeScorecard } from "../../metrics/scorecard";
import { FakeTransport } from "./fake-transport";
import type { AgentContext } from "../context";
import type { ReplyRow } from "../../store/rows";

const kit = defaultKit();
function ctx(store: MemoryStore, now: Date): AgentContext {
  return { store, storage: new MemoryStorage(), transport: new FakeTransport(), kit, kitVersion: 1, settings: new StudioSettings({}), now, trigger: "manual", ownerId: "owner", dryRun: true };
}
const row = (over: Partial<ReplyRow>): ReplyRow => ({
  id: "r1", platform: "instagram", thread_ref: "c1", parent_ref: null, post_id: null, author_handle: "a", author_ref: "a1", their_text: "nice", their_lang: "en", received_at: new Date().toISOString(),
  klass: "praise", draft_reply: null, flag: "none", flag_reason: null, status: "draft", sent_at: null, sent_ref: null, expires_at: new Date().toISOString(), updated_by: "community", created_at: "", updated_at: "", ...over,
});

test("distress and under-18 get the kit's lines word for word, whatever the model drafted", () => {
  const d = enforceReplyRules(row({ klass: "distress", their_lang: "fr" }), { reply: "Hang in there!", flag: "none", flag_reason: null }, kit);
  assert.equal(d.reply, kit.help_lines.fr);
  assert.equal(d.flag, "distress");
  const u = enforceReplyRules(row({ klass: "under18" }), { reply: "Sure, here's the link", flag: "none", flag_reason: null }, kit);
  assert.equal(u.reply, kit.adults_only.en);
  assert.equal(u.flag, "under18");
});

test("no link unless they asked, and complaints come to the owner first", () => {
  const plain = enforceReplyRules(row({ their_text: "love this" }), { reply: "Thank you! https://astrostudy.co.uk/test/?src=ig", flag: "none", flag_reason: null }, kit);
  assert.ok(!plain.reply.includes("http"));
  const asked = enforceReplyRules(row({ their_text: "where do I take the test?" }), { reply: "Here: https://astrostudy.co.uk/test/?src=ig", flag: "none", flag_reason: null }, kit);
  assert.ok(asked.reply.includes("https://"));
  const complaint = enforceReplyRules(row({ klass: "complaint" }), { reply: "I'm sorry, I'll look into it.", flag: "none", flag_reason: null }, kit);
  assert.equal(complaint.flag, "complaint");
});

test("the community run sorts, drafts, flags, and never sends", async () => {
  const store = new MemoryStore();
  const now = new Date("2026-11-20T07:00:00Z");
  const pull = async (platform: string) =>
    platform === "instagram"
      ? [
          { platform, thread_ref: "c1", their_text: "this is nonsense", received_at: now.toISOString(), author_ref: "u1" },
          { platform, thread_ref: "c2", their_text: "buy followers promo", received_at: now.toISOString(), author_ref: "u2" },
          { platform, thread_ref: "c3", their_text: "some days I want to die", received_at: now.toISOString(), author_ref: "u3" },
        ]
      : [];
  const result = await runCommunity(ctx(store, now), pull);
  assert.equal(result.outcome, "ok", result.error ?? "");
  const replies = await store.replies({});
  assert.equal(replies.length, 3);
  assert.equal(replies.find((r) => r.thread_ref === "c2")?.status, "skipped");
  const distress = replies.find((r) => r.thread_ref === "c3");
  assert.equal(distress?.flag, "distress");
  assert.equal(distress?.draft_reply, kit.help_lines.en);
  assert.ok(replies.every((r) => r.status !== "sent" && r.sent_at === null));
  const urgent = await store.reminders({});
  assert.ok(urgent.some((r) => r.kind === "replies-due" && r.urgent && r.linked_id === distress?.id));
});

test("the scorecard is counted by code: tests by src, the cap days, a missing platform", () => {
  const week = "2026-W47";
  const from = new Date("2026-11-13T23:00:00Z");
  const to = new Date("2026-11-20T23:00:00Z");
  const sessions = Array.from({ length: 120 }, (_, i) => ({
    id: `s${i}`, language: "en", source: i < 60 ? "tt" : i < 100 ? "ig" : "pin", status: "finished", total: 10, answered: 10, recognised: 6,
    news_consent_at: i % 2 ? "2026-11-16T10:00:00Z" : null, birth_time_known: true, created_at: i < 55 ? "2026-11-16T10:00:00Z" : "2026-11-17T10:00:00Z", finished_at: null,
  }));
  const post = (id: string, platform: "tiktok" | "instagram", card: string) => ({
    id, card_id: card, platform, format: "video" as const, language: "en" as const, script: null, lines: null, caption: null, title: null, description: null, tags: [], slides: null, spec: null, disclosure: true,
    scheduled_at: "2026-11-16T06:30:00Z", status: "posted" as const, gate: null, by_hand: false, platform_post_id: "x", platform_url: null, platform_state: null, posted_at: "2026-11-16T06:31:00Z",
    error: null, retries: 0, approved_at: null, approved_by: null, confirmed_at: null, run_id: null, updated_by: "publish", created_at: "", updated_at: "",
  });
  const cardRow = (id: string, hook: string) => ({
    id, week, pillar: "test" as const, language: "en" as const, idea: "i", hook, points: [], figures: [], cta: "c", anchor: null, sky_date: null, formats: [], src: null, kit_version: 1, prompt_version: 1,
    parent: null, hook_id: null, status: "approved" as const, reason: null, run_id: null, created_by: "s", approved_at: null, approved_by: null, updated_by: "s", created_at: "", updated_at: "",
  });
  const card = computeScorecard(kit, {
    week, from, to,
    posts: [post("p1", "tiktok", "c1"), post("p2", "instagram", "c2")],
    cards: [cardRow("c1", "A hook that flew"), cardRow("c2", "A quiet hook")],
    metrics: [{ post_id: "p1", day: "2026-11-17", views: 5000, likes: 300, comments: 80, shares: 20, saves: 10, link_taps: null, keyword_comments: 40, source: "tiktok", fetched_at: "" }],
    sessions, earlierMetricsDays: 14, orders: [], earlierOrders: [], runs: [], inputs: null, dailyCap: 50, connected: new Set(),
  });
  assert.equal(card.rows.find((r) => r.measure === "Tests started")?.value, "120");
  assert.equal(card.byPlatform.find((p) => p.platform === "tiktok")?.tests, 60);
  assert.deepEqual(card.missing, ["Instagram"]);
  assert.ok(card.verdicts.some((v) => v.rule === "raise the test's cap" && v.triggered), "two days at 50+ tests");
  assert.ok(card.verdicts.some((v) => v.rule === "the paid push" && v.triggered), "80 comments on 5,000 views is 1.6%");
  assert.equal(card.rows.find((r) => r.measure === "DMs sent")?.value, "missing (Friday field)");
});

test("the analyst saves the scorecard and a 09:00 reminder", async () => {
  const store = new MemoryStore();
  const now = new Date("2026-11-20T06:00:00Z");
  const result = await runAnalyst(ctx(store, now));
  assert.equal(result.outcome, "ok", result.error ?? "");
  const sc = await store.scorecard("2026-W47");
  assert.ok(sc);
  assert.deepEqual(sc?.for_owner, ["Read the scorecard."]);
  const reminders = await store.reminders({});
  const r = reminders.find((x) => x.kind === "scorecard");
  assert.equal(r?.due_at, "2026-11-20T08:00:00.000Z");
});
