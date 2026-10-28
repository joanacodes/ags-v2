/**
 * The nightly housekeeping (03:15 Paris): replies past their 30 days are deleted (privacy: nothing
 * about a commenter is kept longer); previews and media past their retention are removed; the tick's
 * own rows older than two weeks are pruned; every connection's state is brought up to date, and the
 * tokens that die when idle (Threads, Pinterest) are renewed.
 */
import type { AgentContext } from "../agents/context";
import { Http } from "../outbox/http";
import { refreshPinterest } from "../outbox/pinterest";
import { refreshThreadsToken } from "../outbox/threads";
import { loadToken, saveToken, statusOf } from "../outbox/tokens";
import { CONNECTIONS, type ClientDeps } from "../outbox/types";
import { withRun } from "../run";

export async function runMaintenance(ctx: AgentContext, opts: { fetchImpl?: typeof fetch } = {}) {
  const { store, storage, settings, now } = ctx;
  return withRun(store, { agent: "maintenance", trigger: ctx.trigger }, async (log) => {
    const lib = settings.get("library");
    const replies = await store.deleteExpiredReplies(now.toISOString());
    log.note(`${replies} expired replies deleted`);

    const previewsBefore = new Date(now.getTime() - lib.previews_days * 86400_000).toISOString();
    let previews = 0;
    for (const folder of ["previews/tts", "previews/video"]) {
      const old = (await storage.list(folder).catch(() => [])).filter((f) => f.createdAt && f.createdAt < previewsBefore);
      if (old.length) await storage.remove(old.map((f) => f.path));
      previews += old.length;
    }
    if (previews) log.note(`${previews} old previews removed`);

    // Media of pieces posted long ago: the platforms hold the posts; the files are no longer needed.
    const mediaBefore = new Date(now.getTime() - lib.media_days * 86400_000).toISOString();
    const oldPosts = (await store.posts({ statuses: ["posted", "killed"], limit: 1000 })).filter((p) => (p.posted_at ?? p.updated_at) < mediaBefore);
    if (oldPosts.length) {
      const media = await store.media({ postIds: oldPosts.map((p) => p.id) });
      if (media.length) {
        await storage.remove(media.map((m) => m.path)).catch(() => undefined);
        await store.deleteMedia(media.map((m) => m.id));
        log.note(`${media.length} media files past ${lib.media_days} days removed`);
      }
    }

    const pruned = await store.deleteRuns({ agent: "tick", before: new Date(now.getTime() - 14 * 86400_000).toISOString() });
    if (pruned) log.note(`${pruned} old tick rows pruned`);

    for (const key of CONNECTIONS) {
      const token = await loadToken(store, key);
      if (!token) continue;
      const deps: ClientDeps = { http: new Http(false, opts.fetchImpl), token, saveToken: (t) => saveToken(store, key, t, now) };
      try {
        if (key === "threads") await refreshThreadsToken(deps, now);
        if (key === "pinterest") {
          const lapse = token.account["refresh_expires_at"];
          if (lapse && Date.parse(lapse) - now.getTime() < 14 * 86400_000) await refreshPinterest(deps, true);
        }
      } catch (err) {
        log.note(`${key}: the token couldn't be renewed (${err instanceof Error ? err.message : String(err)})`);
      }
      const current = (await loadToken(store, key)) ?? token;
      const row = (await store.connections()).find((c) => c.platform === key);
      const status = statusOf(current, now);
      if (row && row.status !== status && row.status !== "disconnected") await store.upsertConnection({ ...row, status });
    }
    return { outcome: "ok" as const };
  });
}
