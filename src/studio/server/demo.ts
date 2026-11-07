/**
 * The local demo: with no Supabase and STUDIO_DEMO=1, the Studio runs on an in-memory store filled the
 * way a real fortnight fills it, by the real agents with a stand-in model (this week posted and counted,
 * next week drafted and waiting), so every screen can be seen and tried on a laptop. Never in production.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { AgentContext } from "../agents/context";
import { runStrategist } from "../agents/strategist";
import { runAnalyst } from "../agents/analyst";
import { mediaNeed } from "../render/need";
import { saveToken } from "../outbox/tokens";
import { addDays, fromParis, nextWeek, parisDate, parisWeek } from "../time";

export async function seedDemo(ctx: AgentContext, ownerId: string): Promise<void> {
  const { store, storage, now } = ctx;
  const thisWeek = parisWeek(now);
  await runStrategist({ ...ctx, now: new Date(now.getTime() - 3 * 86400_000), trigger: "cron" }, { write: true, week: thisWeek });
  await runStrategist({ ...ctx, trigger: "cron" }, { write: true, week: nextWeek(thisWeek) });

  // This week: approved by the owner; what is past went out (dry run), the rest waits for its slot.
  const cards = await store.cards({ weeks: [thisWeek] });
  const posts = await store.posts({ cardIds: cards.map((c) => c.id), limit: 5000 });
  const at = now.toISOString();
  await store.updateCards(cards.map((c) => c.id), { status: "approved", approved_by: ownerId, approved_at: at }, "owner");
  const poster = await readFile(path.resolve("public/studio/media/meadow-poster-tall.jpg"));
  const loop = await readFile(path.resolve("public/studio/media/meadow-loop-tall.mp4"));
  await storage.upload("demo/poster.jpg", poster, "image/jpeg");
  await storage.upload("demo/video.mp4", loop, "video/mp4");
  let i = 0;
  for (const p of posts) {
    if (p.status !== "draft") continue;
    i += 1;
    const slot = p.scheduled_at ? new Date(p.scheduled_at) : now;
    const past = slot.getTime() < now.getTime();
    const need = mediaNeed(p);
    if (need) await store.insertMedia({ post_id: p.id, kind: need === "video" ? "video" : "image", path: need === "video" ? "demo/video.mp4" : "demo/poster.jpg", bytes: need === "video" ? loop.byteLength : poster.byteLength, duration_ms: need === "video" ? 30000 : null, width: 1080, height: need === "video" ? 1920 : 1350, sha256: null, meta: { demo: true } });
    if (need === "video") await store.insertMedia({ post_id: p.id, kind: "thumbnail", path: "demo/poster.jpg", bytes: poster.byteLength, duration_ms: null, width: 1080, height: 1920, sha256: null, meta: { demo: true } });
    const byHand = ctx.settings.postingMode(p.platform) !== "api";
    if (past && !byHand) {
      await store.updatePosts([p.id], { status: "posted", approved_by: ownerId, approved_at: at, confirmed_at: at, platform_post_id: `dry-run:${p.id}`, posted_at: slot.toISOString() }, "publish");
      await store.upsertMetrics([{ post_id: p.id, day: parisDate(now), views: 300 + ((i * 137) % 2400), likes: 10 + ((i * 31) % 120), comments: (i * 7) % 18, shares: (i * 3) % 25, saves: (i * 5) % 40, link_taps: (i * 2) % 12, keyword_comments: i % 4, source: p.platform }]);
    } else if (past && byHand) {
      await store.updatePosts([p.id], { status: i % 3 === 0 ? "posted" : "queued", approved_by: ownerId, approved_at: at, platform_url: i % 3 === 0 ? "https://www.tiktok.com/@theastrostudy/video/7430000000000000000" : null, posted_at: i % 3 === 0 ? slot.toISOString() : null }, "publish");
    } else {
      await store.updatePosts([p.id], { status: i % 9 === 0 ? "failed" : "rendered", error: i % 9 === 0 ? "Threads answered 500: the service was briefly unavailable" : null, approved_by: ownerId, approved_at: at, confirmed_at: i % 2 === 0 ? at : null, platform_state: i % 9 === 0 ? { stage: "publish", last_attempt: at } : null, retries: i % 9 === 0 ? 1 : 0 }, "owner");
    }
  }

  // Replies the community agent drafted, flags first.
  const someone = posts.find((p) => p.platform === "instagram");
  const replies = await store.insertReplies([
    { platform: "instagram", thread_ref: "c-demo-1", their_text: "TEST", received_at: new Date(now.getTime() - 3600_000).toISOString(), author_handle: "lune.et.sel", post_id: someone?.id ?? null, their_lang: "en" },
    { platform: "threads", thread_ref: "c-demo-2", their_text: "This is just Barnum statements dressed up.", received_at: new Date(now.getTime() - 7200_000).toISOString(), author_handle: "skeptic.sam", their_lang: "en" },
    { platform: "instagram", thread_ref: "c-demo-3", their_text: "I'm 16, can I take the test?", received_at: new Date(now.getTime() - 5400_000).toISOString(), author_handle: "jules_x", their_lang: "en" },
    { platform: "facebook", thread_ref: "c-demo-4", their_text: "Où est le lien pour faire le test ?", received_at: new Date(now.getTime() - 9000_000).toISOString(), author_handle: "Claire M.", their_lang: "fr" },
  ]);
  const drafts: [string, string, "none" | "under18", string | null][] = [
    ["question", "Here it is: astrostudy.co.uk/test/?src=ig — three statements a round, one is from your chart.", "none", null],
    ["sceptic", "That's exactly what the test checks: two decoys, one real statement, you pick. Try it and see your score.", "none", null],
    ["under18", ctx.kit.adults_only.en, "under18", "says they are 16"],
    ["question", "Le voici : astrostudy.co.uk/fr/test/?src=fb — trois affirmations par tour, une seule vient de votre thème.", "none", null],
  ];
  for (const [k, r] of replies.entries()) {
    const d = drafts[k]!;
    await store.updateReply(r.id, { klass: d[0] as never, draft_reply: d[1], flag: d[2], flag_reason: d[3] }, "community");
  }

  // The connections, as they might stand in the first week.
  const later = (days: number) => new Date(now.getTime() + days * 86400_000).toISOString();
  await saveToken(store, "threads", { access_token: "demo", expires_at: later(52), account: { user_id: "1", username: "theastrostudy" } }, now, "@theastrostudy");
  await saveToken(store, "meta", { access_token: "demo", expires_at: null, account: { page_id: "1", page_token: "demo", ig_user_id: "2", ig_username: "theastrostudy" } }, now, "The Astro Study · @theastrostudy");
  await saveToken(store, "youtube", { access_token: "demo", expires_at: later(5), account: { channel_id: "UC1", username: "The Astro Study" } }, now, "The Astro Study");
  await saveToken(store, "bluesky", { access_token: "demo", expires_at: null, account: { handle: "theastrostudy.bsky.social", service: "https://bsky.social" } }, now, "@theastrostudy.bsky.social");

  await store.putTts({ hash: "demo-1", voice_id: "demo", characters: 4200, duration_ms: 9 * 60_000, path: "tts/demo-1.mp3" });
  await runAnalyst({ ...ctx, trigger: "cron" });
  const tick = await store.startRun({ agent: "tick", trigger: "tick" });
  await store.finishRun(tick.id, { outcome: "ok" });
  await store.insertReminder({ kind: "custom", title: "Record the voice sample for the clone", body: "Two minutes, quiet room, the consent sentence first.", due_at: new Date(now.getTime() - 600_000).toISOString(), created_by: "owner", channels: ["in_app"] });
  await store.insertReminder({ kind: "calendar-event", title: "In two days: the keyword day", body: "\"Comment TEST\" starts on every Instagram and TikTok caption.", due_at: fromParis(addDays(parisDate(now), 1), "09:00").toISOString(), created_by: "studio", channels: ["in_app"] });
}
