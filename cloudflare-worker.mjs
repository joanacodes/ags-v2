/**
 * Cloudflare Worker entry: the OpenNext app (fetch) plus a timer
 * (scheduled, every minute — see "triggers" in wrangler.jsonc) that writes
 * queued readings on the server, so "Generate all categories" keeps going
 * when the phone is locked.
 */
import app from "./.open-next/worker.js";

export { DOQueueHandler, DOShardedTagCache } from "./.open-next/worker.js";

export default {
  fetch: app.fetch,

  async scheduled(_event, env, ctx) {
    if (!env.CRON_SECRET || !env.SUPABASE_SECRET_KEY) return;
    const request = new Request("https://ags.internal/api/jobs/run", {
      method: "POST",
      headers: { "x-ags-cron": env.CRON_SECRET },
    });
    const response = await app.fetch(request, env, ctx);
    if (!response.ok) console.error(`[cron] job runner answered ${response.status}`);
    else console.log(`[cron] ${await response.text()}`);
  },
};
