/**
 * A real render on this machine, with no keys: a card, four approved pieces (a video, a carousel, a
 * pin, a text post with its still), the render worker, then the media gate's verdicts. ElevenLabs is
 * replaced by a tone track with real timings so the voiced path (loudness, disclosure frame) runs.
 *
 *   npx tsx scripts/smoke-render.ts [out-dir]
 */
import { mkdir, writeFile, readFile } from "node:fs/promises";
import path from "node:path";
import { MemoryStore } from "../src/studio/store/memory";
import { LocalMediaStorage } from "../src/studio/server/local-storage";
import { defaultKit } from "../src/studio/kit/load";
import { StudioSettings } from "../src/studio/settings";
import { renderOne, type RenderEnv } from "../src/studio/render/render";
import { launchBrowser } from "../src/studio/video/frames";
import { ffmpeg } from "../src/studio/video/ffmpeg";
import { RunLog } from "../src/studio/run";
import type { AgentContext } from "../src/studio/agents/context";

const out = path.resolve(process.argv[2] ?? ".studio-work/smoke");

/** An ElevenLabs stand-in: a soft tone per word, with character timings at 150 words a minute. */
function fakeElevenLabs(work: string): typeof fetch {
  return (async (_url: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? "{}")) as { text: string };
    const chars = [...body.text];
    const per = 0.4 / 6;
    const starts = chars.map((_, i) => i * per);
    const seconds = chars.length * per + 0.3;
    const file = path.join(work, `fake-voice-${Date.now()}.mp3`);
    await ffmpeg(["-f", "lavfi", "-i", `sine=frequency=210:sample_rate=44100:duration=${seconds.toFixed(2)}`, "-af", "volume=0.6,tremolo=f=4:d=0.7", "-c:a", "libmp3lame", "-b:a", "128k", file]);
    const audio = await readFile(file);
    return new Response(JSON.stringify({ audio_base64: audio.toString("base64"), alignment: { characters: chars, character_start_times_seconds: starts, character_end_times_seconds: starts.map((s) => s + per * 0.9) } }), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
}

async function main() {
  await mkdir(out, { recursive: true });
  const store = new MemoryStore();
  const storage = new LocalMediaStorage(path.join(out, "bucket"));
  const settings = new StudioSettings({ "render-video": { voice_id: "fake-voice" } });
  const ctx: AgentContext = { store, storage, transport: null, kit: defaultKit(), kitVersion: 1, settings, now: new Date("2026-11-15T23:30:00Z"), trigger: "manual", ownerId: "owner", dryRun: true };
  const [card] = await store.insertCards(
    [
      {
        week: "2026-W47",
        pillar: "placements",
        language: "en",
        idea: "The responsible child is often a Saturn story",
        hook: "If you were the responsible one at nine years old, this is probably why.",
        points: ["Saturn's house shows where duty arrived early", "it's a strength that took longer to learn"],
        figures: [{ value: "7 in 10", label: "recognised their Saturn description", source: "the Study page, week 46", verified: true }],
        cta: "comment TEST",
        formats: ["video", "carousel", "pin", "text"],
        anchor: "Saturn",
      },
    ],
    "smoke",
  );
  const script = "Birth chart, Saturn, and the nine-year-old who did the grown-up's job. Saturn's house shows where duty arrived early. It's a strength that took longer to learn, not a punishment. In my blind test, 7 in 10 people recognise this one. Comment TEST.";
  const posts = await store.insertPosts(
    [
      { card_id: card!.id, platform: "tiktok", format: "video", language: "en", script, lines: ["If you were the responsible one at nine,", "this is probably why.", "Saturn shows where duty", "arrived early.", "A strength that took longer to learn.", "7 in 10 recognise it.", "Comment TEST."], caption: "x", disclosure: true, spec: { kind: "video", template: "meadow-text" }, status: "approved" },
      { card_id: card!.id, platform: "instagram", format: "video", language: "en", script, lines: ["Birth chart, Saturn:", "which one is you?"], caption: "x", disclosure: true, spec: { kind: "video", template: "test-three-cards", statements: ["You were the one who kept the house running when nobody asked.", "You learnt early that being liked mattered more than being right.", "You were the one who made everyone laugh when things went quiet."] }, status: "approved" },
      { card_id: card!.id, platform: "instagram", format: "carousel", language: "en", caption: "x", slides: [{ heading: "Your Saturn is not your punishment", body: "" }, { heading: "Saturn's house", body: "where duty arrived early" }, { heading: "In the 4th", body: "the one who kept the house running" }, { heading: "In the 10th", body: "the one who had to be good at everything" }, { heading: "A strength", body: "that took longer to learn" }, { heading: "Take the blind test", body: "comment TEST" }], status: "approved" },
      { card_id: card!.id, platform: "pinterest", format: "pin", language: "en", title: "Saturn in the birth chart, explained in plain words", description: "What Saturn's house says about where duty arrived early.", status: "approved" },
      { card_id: card!.id, platform: "bluesky", format: "text", language: "en", caption: "Your Saturn is not your punishment.", status: "approved" },
    ],
    "smoke",
  );
  const browser = await launchBrowser();
  const env: RenderEnv = { ctx, browser, publicDir: path.resolve("public/studio"), workRoot: path.join(out, "work"), elevenLabsKey: "fake", allowSilent: false };
  const original = globalThis.fetch;
  globalThis.fetch = fakeElevenLabs(out);
  const log = new RunLog();
  try {
    for (const p of posts) {
      const t0 = Date.now();
      const result = await renderOne(env, p, card!, log);
      const after = (await store.posts({ ids: [p.id] }))[0]!;
      console.log(`${p.platform}/${p.format}: ${result} in ${((Date.now() - t0) / 1000).toFixed(1)} s`, after.gate?.failures.length ? JSON.stringify(after.gate.failures) : "", after.error ?? "");
    }
  } finally {
    globalThis.fetch = original;
    await browser.close();
  }
  const media = await store.media({});
  await writeFile(path.join(out, "media.json"), JSON.stringify(media, null, 1));
  console.log(media.map((m) => `${m.kind} ${m.path} ${(m.bytes / 1000).toFixed(0)} kB ${m.width ?? ""}x${m.height ?? ""} ${m.duration_ms ?? ""}`).join("\n"));
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
