import { test } from "node:test";
import assert from "node:assert/strict";
import { MemoryStore } from "../../store/memory";
import { startClock, stopClock, tickAuthorized, TICK_PATH } from "../clock";

test("the clock is started at the Studio's address with a fresh secret, which the tick then expects", async () => {
  const store = new MemoryStore();
  assert.equal(await tickAuthorized(store, "anything", {}), false, "no clock, no call accepted");
  const { url } = await startClock(store, "https://ags.example.com/");
  assert.equal(url, `https://ags.example.com${TICK_PATH}`);
  const secret = (await store.tickSecret())!;
  assert.ok(secret.length >= 32);
  assert.equal(await tickAuthorized(store, secret, {}), true);
  assert.equal(await tickAuthorized(store, `${secret}x`, {}), false);
  assert.equal(await tickAuthorized(store, null, {}), false);
  // a restart makes a new secret and cuts off the old one
  await startClock(store, "https://ags.example.com");
  assert.equal(await tickAuthorized(store, secret, {}), false);
  const events = await store.events({ table: "studio_settings", rowId: "clock" });
  assert.deepEqual(events.map((e) => e.to_status), ["started", "started"]);
  assert.ok(!JSON.stringify(events).includes(secret), "the secret never reaches the audit trail");
});

test("a plain-http address is refused, as the database refuses it", async () => {
  const store = new MemoryStore();
  await assert.rejects(startClock(store, "http://localhost:3000"), /https/);
  assert.equal(await store.tickSecret(), null);
});

test("a Vercel cron can stand in with CRON_SECRET; stopping the clock keeps that door only", async () => {
  const store = new MemoryStore();
  await startClock(store, "https://ags.example.com");
  const secret = (await store.tickSecret())!;
  assert.equal(await tickAuthorized(store, "cron-secret-from-vercel", { CRON_SECRET: "cron-secret-from-vercel" }), true);
  await stopClock(store);
  assert.equal(await tickAuthorized(store, secret, {}), false);
  assert.equal(await tickAuthorized(store, "cron-secret-from-vercel", { CRON_SECRET: "cron-secret-from-vercel" }), true);
});

test("a Vault that can't be read refuses the call rather than letting it through", async () => {
  const broken = { tickSecret: async (): Promise<string | null> => { throw new Error("vault down"); } };
  assert.equal(await tickAuthorized(broken, "x".repeat(40), {}), false);
});
