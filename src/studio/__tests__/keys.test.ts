import { test } from "node:test";
import assert from "node:assert/strict";
import { checkKey, hydrateKeys, keyLines, resetKeysForTests, STUDIO_KEYS, vaultName, type StoredKey } from "../keys";
import { MemoryStore } from "../store/memory";

const source = (keys: StoredKey[]) => {
  let reads = 0;
  return { reads: () => reads, studioKeys: async () => (reads++, keys) };
};

test("every key has a Vault name the database accepts, and none is listed twice", () => {
  const names = STUDIO_KEYS.map((k) => vaultName(k.env));
  for (const n of names) assert.match(n, /^[a-z0-9_-]{2,40}$/, n);
  assert.equal(new Set(names).size, names.length);
  assert.equal(vaultName("ELEVENLABS_API_KEY"), "key-elevenlabs-api-key");
});

test("a key pasted in the Studio wins over the environment; removing it gives the environment's back", async () => {
  resetKeysForTests();
  const env: Record<string, string | undefined> = { ELEVENLABS_API_KEY: "from-vercel", RESEND_API_KEY: undefined };
  await hydrateKeys(source([{ name: "key-elevenlabs-api-key", value: "from-studio", updated_at: "2026-10-28T10:00:00Z" }, { name: "key-resend-api-key", value: "re_123", updated_at: "2026-10-28T10:00:00Z" }]), { env, now: 0 });
  assert.equal(env.ELEVENLABS_API_KEY, "from-studio");
  assert.equal(env.RESEND_API_KEY, "re_123");
  await hydrateKeys(source([]), { env, now: 1, force: true });
  assert.equal(env.ELEVENLABS_API_KEY, "from-vercel");
  assert.equal("RESEND_API_KEY" in env, false);
});

test("keys are read at most once a minute unless a change forces it", async () => {
  resetKeysForTests();
  const env: Record<string, string | undefined> = {};
  const s = source([{ name: "key-postly-api-key", value: "pk_1", updated_at: "2026-10-28T10:00:00Z" }]);
  await hydrateKeys(s, { env, now: 0 });
  await hydrateKeys(s, { env, now: 30_000 });
  assert.equal(s.reads(), 1);
  await hydrateKeys(s, { env, now: 61_000 });
  assert.equal(s.reads(), 2);
  await hydrateKeys(s, { env, now: 62_000, force: true });
  assert.equal(s.reads(), 3);
});

test("the screen sees where a key comes from, an id in full, and never a secret's value", async () => {
  resetKeysForTests();
  const env: Record<string, string | undefined> = { STRIPE_READ_KEY: "rk_live_env" };
  await hydrateKeys(
    source([
      { name: "key-meta-app-id", value: "1234567890", updated_at: "2026-10-28T10:00:00Z" },
      { name: "key-meta-app-secret", value: "very-secret", updated_at: "2026-10-28T10:00:00Z" },
    ]),
    { env, now: 0 },
  );
  const { keys, shared } = keyLines(env);
  const by = new Map(keys.map((k) => [k.env, k]));
  assert.deepEqual([by.get("META_APP_ID")?.state, by.get("META_APP_ID")?.shown], ["studio", "1234567890"]);
  assert.deepEqual([by.get("META_APP_SECRET")?.state, by.get("META_APP_SECRET")?.shown], ["studio", null]);
  assert.deepEqual([by.get("STRIPE_READ_KEY")?.state, by.get("STRIPE_READ_KEY")?.shown], ["environment", null]);
  assert.equal(by.get("ELEVENLABS_API_KEY")?.state, "missing");
  assert.ok(!JSON.stringify({ keys, shared }).includes("very-secret"));
  assert.ok(!JSON.stringify({ keys, shared }).includes("rk_live_env"));
});

test("the memory store keeps keys apart from tokens", async () => {
  const store = new MemoryStore();
  await store.putSecret("token-meta", "a token");
  await store.putSecret("key-postly-api-key", "pk_2");
  const keys = await store.studioKeys();
  assert.deepEqual(keys.map((k) => [k.name, k.value]), [["key-postly-api-key", "pk_2"]]);
});

const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

test("a check reads once and says what the service answered", async () => {
  const calls: string[] = [];
  const f = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push(`${init?.method ?? "GET"} ${String(url)}`);
    const u = String(url);
    if (u.includes("postly")) return reply(200, { data: [{ _id: "w1" }, { _id: "w2" }] });
    if (u.includes("resend")) return reply(401, { message: "This API key is restricted to only send emails" });
    if (u.includes("stripe")) return reply(401, { error: { message: "Invalid API Key provided" } });
    if (u.includes("github")) return reply(200, { workflows: [{ path: ".github/workflows/studio-run.yml" }] });
    return reply(404, {});
  }) as typeof fetch;
  const env = { POSTLY_API_KEY: "pk", RESEND_API_KEY: "re", STRIPE_READ_KEY: "rk", GITHUB_STUDIO_TOKEN: "gh" };
  assert.deepEqual(await checkKey("POSTLY_API_KEY", { env, fetchImpl: f }), { ok: true, detail: "Postly answered: 2 workspaces" });
  assert.deepEqual(await checkKey("RESEND_API_KEY", { env, fetchImpl: f }), { ok: true, detail: "Resend answered: a sending-only key" });
  assert.deepEqual(await checkKey("STRIPE_READ_KEY", { env, fetchImpl: f }), { ok: false, detail: "Stripe answered 401: Invalid API Key provided" });
  const gh = await checkKey("GITHUB_STUDIO_TOKEN", { env, fetchImpl: f });
  assert.equal(gh.ok, false);
  assert.match(gh.detail, /no studio-render\.yml/);
  assert.deepEqual(await checkKey("ELEVENLABS_API_KEY", { env, fetchImpl: f }), { ok: false, detail: "not set" });
  assert.deepEqual(await checkKey("META_APP_SECRET", { env, fetchImpl: f }), { ok: false, detail: "this key has no check: Connect tests it" });
  assert.ok(calls.every((c) => c.startsWith("GET ")), "a check never writes");
});

test("Vault out of reach leaves the keys in force and says why, without taking the screens down", async () => {
  resetKeysForTests();
  const env: Record<string, string | undefined> = { ELEVENLABS_API_KEY: "from-vercel" };
  await hydrateKeys({ studioKeys: async () => { throw new Error("function public.studio_keys() does not exist"); } }, { env, now: 0 });
  assert.equal(env.ELEVENLABS_API_KEY, "from-vercel");
  assert.equal(keyLines(env).loadError, "function public.studio_keys() does not exist");
  await hydrateKeys(source([]), { env, now: 1, force: true });
  assert.equal(keyLines(env).loadError, null);
});
