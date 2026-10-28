/**
 * The metrics worker (no model), nightly at 00:30 Paris. For every piece posted in the last week: its
 * running totals from its platform, one row per piece per day (the scorecard reads the latest), with
 * the comments that answered the call to action ("comment TEST") counted from the pulled replies.
 * Then the orders from Stripe and the email rates from MailerLite. A platform that can't be read is
 * named in the run's notes and reported missing by the analyst, never estimated.
 */
import type { AgentContext } from "../agents/context";
import { checkoutSessions } from "../clients/stripe";
import { emailRates } from "../clients/mailerlite";
import { PlatformError, type Fetch } from "../outbox/http";
import { isPostlyId } from "../outbox/postly";
import { isDryRunId } from "../outbox/publish";
import { clientFor } from "../outbox/registry";
import { SkipRun, withRun } from "../run";
import type { MetricRow, PostRow } from "../store/rows";
import { parisDate, parisWeek, weekStart } from "../time";
import { PLATFORM_LABELS, type Platform } from "../types";

/** A comment that answers the call to action: the keyword on its own, in either language. */
export const KEYWORD_COMMENT = /(^|[^\p{L}])test([^\p{L}]|$)/iu;

export interface MetricsOptions {
  readonly fetchImpl?: Fetch;
}

export async function runMetrics(ctx: AgentContext, opts: MetricsOptions = {}) {
  const { store, settings, now } = ctx;
  return withRun(store, { agent: "metrics", trigger: ctx.trigger }, async (log) => {
    if (settings.get("global").paused) throw new SkipRun("skipped", "the Studio is paused (kill switch)");
    const conf = settings.get("input-metrics");
    if (!conf.enabled) throw new SkipRun("skipped", "the metrics input is turned off in Settings");

    const since = new Date(now.getTime() - conf.days_back * 86400_000).toISOString();
    const posted = (await store.posts({ statuses: ["posted", "queued"], postedFrom: since })).filter(
      (p) => (p.platform_post_id && !isDryRunId(p.platform_post_id) && !isPostlyId(p.platform_post_id)) || (p.platform === "tiktok" && p.platform_url),
    );
    const replies = await store.replies({ since: new Date(now.getTime() - (conf.days_back + 30) * 86400_000).toISOString() });
    const keywordByPost = new Map<string, number>();
    for (const r of replies) if (r.post_id && KEYWORD_COMMENT.test(r.their_text)) keywordByPost.set(r.post_id, (keywordByPost.get(r.post_id) ?? 0) + 1);

    const byPlatform = new Map<Platform, PostRow[]>();
    for (const p of posted) byPlatform.set(p.platform, [...(byPlatform.get(p.platform) ?? []), p]);
    const day = parisDate(now);
    const rows: Omit<MetricRow, "fetched_at">[] = [];
    for (const [platform, list] of byPlatform) {
      const made = await clientFor(store, platform, { kit: ctx.kit, settings, live: false, now, fetchImpl: opts.fetchImpl });
      if ("error" in made) {
        log.note(`${PLATFORM_LABELS[platform]}: numbers not read (${made.error})`);
        continue;
      }
      if (!made.client.numbers) continue;
      let read = 0;
      for (const post of list) {
        try {
          const n = await made.client.numbers(post);
          if (!n) continue;
          rows.push({ post_id: post.id, day, ...n, keyword_comments: keywordByPost.get(post.id) ?? 0, source: platform });
          read += 1;
        } catch (err) {
          log.note(`${PLATFORM_LABELS[platform]}: ${err instanceof Error ? err.message.slice(0, 200) : String(err)}`);
          // A refused token or a missing permission fails every piece the same way: stop asking.
          if (err instanceof PlatformError && (err.status === 401 || err.status === 403)) break;
        }
      }
      log.note(`${PLATFORM_LABELS[platform]}: ${read} of ${list.length} pieces read`);
    }
    await store.upsertMetrics(rows);
    log.count("studio_metrics", rows.length);

    const stripeKey = (process.env.STRIPE_READ_KEY ?? "").trim();
    if (conf.stripe && stripeKey) {
      try {
        // Two days back, so a session made just before last night's run is never missed.
        const orders = await checkoutSessions(stripeKey, new Date(now.getTime() - 2 * 86400_000), now, opts.fetchImpl);
        await store.upsertOrders(orders);
        log.count("studio_orders", orders.length);
      } catch (err) {
        log.note(`Stripe: orders not read (${err instanceof Error ? err.message : String(err)})`);
      }
    } else if (conf.stripe) log.note("Stripe: STRIPE_READ_KEY isn't set, so orders are missing");

    const mailKey = (process.env.MAILERLITE_API_KEY ?? "").trim();
    if (conf.mailerlite && mailKey) {
      try {
        const rates = await emailRates(mailKey, weekStart(now), now, opts.fetchImpl);
        if (rates) {
          const week = parisWeek(now);
          const existing = await store.weeklyInputs(week);
          const manual = (existing?.manual ?? {}) as Record<string, unknown>;
          // The owner's own figure wins: only figures this worker wrote are replaced.
          if (manual["email_open_rate"] === undefined || manual["email_from"] === "mailerlite") {
            await store.putWeeklyInputs({
              week,
              owner_hours: existing?.owner_hours ?? null,
              dm_count: existing?.dm_count ?? null,
              note: existing?.note ?? null,
              manual: { ...manual, email_open_rate: rates.open_rate, email_click_rate: rates.click_rate, email_sent: rates.sent, email_from: "mailerlite", email_source: rates.source },
            });
            log.count("studio_weekly_inputs");
          }
        }
      } catch (err) {
        log.note(`MailerLite: email rates not read (${err instanceof Error ? err.message : String(err)})`);
      }
    } else if (conf.mailerlite) log.note("MailerLite: MAILERLITE_API_KEY isn't set, so the email rates are missing");
    return { outcome: "ok" as const };
  });
}
