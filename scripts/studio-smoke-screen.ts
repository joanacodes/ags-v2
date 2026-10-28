/**
 * A real screen recording on this machine: a few steps on a local page, the voice stood in by a tone
 * track with real timings (as in smoke-render.ts), then the composer and the media gate.
 *
 *   npx tsx scripts/smoke-screen.ts <page-url> [out-dir]
 */
import { mkdir, readFile } from "node:fs/promises";
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

const url = process.argv[2] ?? "http://localhost:8099/order/";
const out = path.resolve(process.argv[3] ?? ".studio-work/screen");

async function main() {
  await mkdir(out, { recursive: true });
  const store = new MemoryStore();
  const ctx: AgentContext = { store, storage: new LocalMediaStorage(path.join(out, "bucket")), transport: null, kit: defaultKit(), kitVersion: 1, settings: new StudioSettings({ "render-video": { voice_id: "fake" } }), now: new Date(), trigger: "manual", ownerId: "o", dryRun: true };
  const [card] = await store.insertCards([{ week: "2026-W47", pillar: "test", language: "en", idea: "How to order", hook: "How to order a reading", points: ["a", "b"], figures: [], cta: "comment TEST", formats: ["video"] }], "smoke");
  const steps = [
    { do: "goto", url },
    { do: "say", text: "Here is how to order your reading, in under a minute." },
    { do: "highlight", selector: "#page-name", seconds: 1.5 },
    { do: "say", text: "Start with your name, a nickname is fine." },
    { do: "type", selector: "#page-name", text: "Joana" },
    { do: "zoom", selector: "#page-email", seconds: 1.5 },
    { do: "say", text: "Then the email where your reading should arrive." },
  ];
  const [post] = await store.insertPosts([{ card_id: card!.id, platform: "youtube", format: "video", language: "en", script: "screen", lines: ["screen"], disclosure: true, spec: { kind: "video", template: "screen-recording", steps }, status: "approved" }], "smoke");
  const original = globalThis.fetch;
  globalThis.fetch = (async (_u: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? "{}")) as { text: string };
    const chars = [...body.text];
    const per = 0.4 / 6;
    const starts = chars.map((_, i) => i * per);
    const file = path.join(out, "voice.mp3");
    await ffmpeg(["-f", "lavfi", "-i", `sine=frequency=200:duration=${(chars.length * per + 0.3).toFixed(2)}`, "-af", "volume=0.6,tremolo=f=4:d=0.7", "-c:a", "libmp3lame", file]);
    return new Response(JSON.stringify({ audio_base64: (await readFile(file)).toString("base64"), alignment: { characters: chars, character_start_times_seconds: starts, character_end_times_seconds: starts.map((s) => s + per * 0.9) } }), { status: 200 });
  }) as typeof fetch;
  const browser = await launchBrowser();
  try {
    const env: RenderEnv = { ctx, browser, publicDir: path.resolve("public/studio"), workRoot: path.join(out, "work"), elevenLabsKey: "fake", allowSilent: false };
    const t0 = Date.now();
    const result = await renderOne(env, post!, card!, new RunLog());
    const after = (await store.posts({ ids: [post!.id] }))[0]!;
    console.log(`screen recording: ${result} in ${((Date.now() - t0) / 1000).toFixed(1)} s`, JSON.stringify(after.gate?.failures ?? []), after.error ?? "");
    console.log((await store.media({})).map((m) => `${m.kind} ${m.path} ${m.duration_ms ?? ""}`).join("\n"));
  } finally {
    globalThis.fetch = original;
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
