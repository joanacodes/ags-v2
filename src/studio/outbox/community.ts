/**
 * The community agent's two ends on the platforms: pulling new comments and mentions (reads, which run
 * the same live or dry), and sending one reply when the owner taps Send. A reply is sent only if its
 * status is `approved` and the owner made that change; with STUDIO_LIVE off it is a dry run that logs
 * the request and marks the reply sent with a `dry-run:` reference.
 */
import { isLive, type AgentContext } from "../agents/context";
import type { CommentPull } from "../agents/community";
import type { ReplyRow } from "../store/rows";
import { isPlatform } from "../types";
import { DryRunStop, redactUrl, type Fetch } from "./http";
import { DRY_RUN_PREFIX, isDryRunId } from "./publish";
import { clientFor } from "./registry";

/** Comments on pieces posted in the last 30 days; Bluesky, Mastodon and X also bring mentions. */
export function commentPull(ctx: AgentContext, fetchImpl?: Fetch): CommentPull {
  return async (platform, since) => {
    const made = await clientFor(ctx.store, platform, { kit: ctx.kit, settings: ctx.settings, live: false, now: ctx.now, fetchImpl });
    if ("error" in made) throw new Error(made.error);
    if (!made.client.comments) return [];
    const posted = await ctx.store.posts({ platforms: [platform], statuses: ["posted"], postedFrom: new Date(ctx.now.getTime() - 30 * 86400_000).toISOString() });
    const pieces = new Map(posted.filter((p) => p.platform_post_id && !isDryRunId(p.platform_post_id)).map((p) => [p.platform_post_id as string, p.id]));
    const mentionsToo = platform === "bluesky" || platform === "mastodon" || platform === "x";
    if (pieces.size === 0 && !mentionsToo) return [];
    return made.client.comments(since, pieces);
  };
}

export type SendResult = { ok: true; ref: string; dryRun: boolean } | { ok: false; error: string };

/** Send one approved reply: called by the route behind the owner's Send button. */
export async function sendReply(ctx: AgentContext, replyId: string, o: { live?: boolean; fetchImpl?: Fetch } = {}): Promise<SendResult> {
  const { store } = ctx;
  const row: ReplyRow | undefined = (await store.replies({ ids: [replyId], limit: 1 }))[0];
  if (!row) return { ok: false, error: "no such reply" };
  if (row.status !== "approved" || row.updated_by !== "owner") return { ok: false, error: "only a reply the owner approved can be sent" };
  const text = (row.draft_reply ?? "").trim();
  if (!text) return { ok: false, error: "the reply is empty" };
  if (!isPlatform(row.platform)) return { ok: false, error: `${row.platform} isn't a platform the Studio answers on` };
  const live = (o.live ?? isLive()) && !!ctx.ownerId;
  const made = await clientFor(store, row.platform, { kit: ctx.kit, settings: ctx.settings, live, now: ctx.now, fetchImpl: o.fetchImpl });
  if ("error" in made) return { ok: false, error: made.error };
  if (!made.client.reply) return { ok: false, error: `replies on ${row.platform} are answered in its app` };
  try {
    const sent = await made.client.reply(row, text);
    await store.updateReply(row.id, { status: "sent", sent_at: ctx.now.toISOString(), sent_ref: sent.ref }, "outbox");
    await store.logEvent({ table: "outbox", rowId: row.id, actor: "outbox", note: `reply sent on ${row.platform}: ${sent.ref}` });
    return { ok: true, ref: sent.ref, dryRun: false };
  } catch (err) {
    if (err instanceof DryRunStop) {
      const ref = `${DRY_RUN_PREFIX}${row.id}`;
      await store.updateReply(row.id, { status: "sent", sent_at: ctx.now.toISOString(), sent_ref: ref }, "outbox");
      await store.logEvent({ table: "outbox", rowId: row.id, actor: "outbox", note: `dry run, would send: ${JSON.stringify({ method: err.request.method, url: redactUrl(err.request.url), body: err.request.body }).slice(0, 2000)}` });
      return { ok: true, ref, dryRun: true };
    }
    const error = err instanceof Error ? err.message : String(err);
    await store.logEvent({ table: "outbox", rowId: row.id, actor: "outbox", note: `reply failed on ${row.platform}: ${error.slice(0, 500)}` });
    return { ok: false, error };
  }
}
