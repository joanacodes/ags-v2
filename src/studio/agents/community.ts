/**
 * The community agent, 08:00 and 18:00 Paris: new comments and mentions in, sorted by Haiku, a reply
 * drafted by Sonnet for each one worth answering, flags on top for the owner. It never sends, follows,
 * blocks or deletes: a draft waits for her tap. Two answers are never left to a model's wording: someone
 * in distress gets the site's help lines, someone under 18 the adults-only line, both word for word.
 */
import type { AgentContext } from "./context";
import { promptFor } from "./context";
import { communitySystem } from "./system";
import { callStructured, StructuredCallError } from "../claude/call";
import { classifyOut, draftOut } from "../prompts/schemas";
import { modelCap } from "../caps";
import { withRun, SkipRun, type RunLog } from "../run";
import { limiter } from "../claude/limit";
import { createAgentReminders } from "../reminders/agent";
import { testLink } from "../kit/load";
import { words } from "../gate/text";
import type { NewReply } from "../store/store";
import type { ReplyRow } from "../store/rows";
import type { Language, Platform } from "../types";
import { isPlatform } from "../types";

/** Comments a platform hands back since a moment; the outbox clients implement it. */
export type CommentPull = (platform: Platform, since: Date) => Promise<NewReply[]>;

const ASKS_HOW = /\b(how|where|link|test|take it|do it|go deeper|book|reading|price|comment|lien|où|faire le test|lecture|prix|tarif)\b/i;
const URL_RE = /\bhttps?:\/\/\S+/gi;

function languageOf(row: ReplyRow): Language {
  return row.their_lang === "fr" ? "fr" : "en";
}

export function enforceReplyRules(row: ReplyRow, draft: { reply: string; flag: ReplyRow["flag"]; flag_reason: string | null }, kit: AgentContext["kit"]): { reply: string; flag: ReplyRow["flag"]; flag_reason: string | null } {
  const lang = languageOf(row);
  if (row.klass === "distress") return { reply: kit.help_lines[lang], flag: "distress", flag_reason: draft.flag_reason ?? "the comment may come from someone in distress" };
  if (row.klass === "under18") return { reply: kit.adults_only[lang], flag: "under18", flag_reason: draft.flag_reason ?? "the person says they are under 18" };
  let reply = draft.reply.trim();
  let flag = draft.flag;
  let reason = draft.flag_reason;
  if (!ASKS_HOW.test(row.their_text)) reply = reply.replace(URL_RE, "").replace(/\s{2,}/g, " ").trim();
  if (words(reply).length > 60) {
    flag = flag === "none" ? "needs_owner" : flag;
    reason = reason ?? "the draft is longer than 60 words";
  }
  if ((row.klass === "complaint" || row.klass === "press") && flag === "none") {
    flag = row.klass;
    reason = reason ?? `a ${row.klass}: the owner sees it first`;
  }
  return { reply, flag, flag_reason: reason };
}

async function classify(ctx: AgentContext, rows: readonly ReplyRow[], log: RunLog): Promise<void> {
  const conf = ctx.settings.model("community-classify");
  const prompt = await promptFor(ctx.store, "community-classify", ctx.settings.get("community").prompt_version);
  for (let i = 0; i < rows.length; i += 30) {
    const chunk = rows.slice(i, i + 30);
    const user = `<items>\n${chunk.map((r) => JSON.stringify({ ref: r.id, platform: r.platform, text: r.their_text })).join("\n")}\n</items>`;
    try {
      const result = await callStructured({
        transport: ctx.transport!,
        model: conf.model,
        effort: conf.effort,
        maxTokens: conf.max_tokens * Math.max(1, Math.ceil(chunk.length / 4)),
        fallbacks: conf.fallbacks,
        system: communitySystem(prompt.text, ctx.kit),
        user,
        schema: classifyOut,
        check: (out) => chunk.filter((r) => !out.items.some((it) => it.ref === r.id)).map((r) => `missing an answer for ref ${r.id}`),
      });
      log.add(result.usage, result.costUsd, result.model);
      for (const item of result.value.items) {
        const row = chunk.find((r) => r.id === item.ref);
        if (!row) continue;
        await ctx.store.updateReply(row.id, { klass: item.klass, their_lang: item.language === "other" ? row.their_lang ?? "en" : item.language, status: item.klass === "spam" ? "skipped" : row.status }, "community");
      }
    } catch (err) {
      if (err instanceof StructuredCallError) log.add(err.usage, err.costUsd);
      log.note(`sorting failed for ${chunk.length} items: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}

async function draftOne(ctx: AgentContext, row: ReplyRow, log: RunLog): Promise<void> {
  const { store, kit } = ctx;
  const conf = ctx.settings.model("community-draft");
  const prompt = await promptFor(store, "community-draft", ctx.settings.get("community").prompt_version);
  const lang = languageOf(row);
  const platform = isPlatform(row.platform) ? row.platform : "instagram";
  const post = row.post_id ? (await store.posts({ ids: [row.post_id] }))[0] ?? null : null;
  const card = post ? (await store.cards({ ids: [post.card_id] }))[0] ?? null : null;
  const history = row.author_ref ? (await store.replies({ authorRef: row.author_ref, since: new Date(ctx.now.getTime() - 30 * 86400_000).toISOString(), limit: 10 })).filter((r) => r.id !== row.id) : [];
  const user = [
    `<item>${JSON.stringify({ platform: row.platform, class: row.klass, language: lang, text: row.their_text, author: row.author_handle })}</item>`,
    post ? `<on_piece>${JSON.stringify({ caption: post.caption ?? post.title, hook: card?.hook ?? null })}</on_piece>` : "<on_piece>(unknown)</on_piece>",
    `<their_last_30_days>\n${history.length ? history.map((h) => `- they said: ${h.their_text}${h.draft_reply ? ` / we answered: ${h.draft_reply}` : ""}`).join("\n") : "(nothing)"}\n</their_last_30_days>`,
    `<test_link>${testLink(kit, lang, platform)}</test_link>`,
    `<help_lines>${kit.help_lines[lang]}</help_lines>`,
    `<adults_only>${kit.adults_only[lang]}</adults_only>`,
  ].join("\n");
  try {
    const result = await callStructured({
      transport: ctx.transport!,
      model: conf.model,
      effort: conf.effort,
      maxTokens: conf.max_tokens,
      fallbacks: conf.fallbacks,
      system: communitySystem(prompt.text, kit),
      user,
      schema: draftOut,
    });
    log.add(result.usage, result.costUsd, result.model);
    const settled = enforceReplyRules(row, result.value, kit);
    await store.updateReply(row.id, { draft_reply: settled.reply, flag: settled.flag, flag_reason: settled.flag_reason }, "community");
    log.count("studio_replies");
    if (settled.flag !== "none") {
      await store.insertReminder({
        kind: "replies-due",
        title: settled.flag === "distress" ? "Someone may be in distress" : `A reply needs you: ${settled.flag.replace("_", " ")}`,
        body: `${row.platform}: "${row.their_text.slice(0, 200)}"\n\n${settled.flag_reason ?? ""}`,
        due_at: ctx.now.toISOString(),
        urgent: true,
        channels: ["in_app", "email"],
        linked_table: "studio_replies",
        linked_id: row.id,
        link: "/studio/today#replies",
        created_by: "community",
        dedupe_key: `reply-flag:${row.id}`,
      });
    }
    const reminders = await createAgentReminders(store, "community", result.value.reminders, ctx.now, { table: "studio_replies", id: row.id });
    for (const r of reminders.refused) log.note(`reminder refused: ${r}`);
  } catch (err) {
    if (err instanceof StructuredCallError) log.add(err.usage, err.costUsd);
    log.note(`no draft for a ${row.platform} comment: ${err instanceof Error ? err.message : String(err)}`);
  }
}

export async function runCommunity(ctx: AgentContext, pull: CommentPull) {
  const { store, settings } = ctx;
  const conf = settings.get("community");
  return withRun(store, { agent: "community", trigger: ctx.trigger, model: settings.model("community-draft").model }, async (log) => {
    if (!conf.enabled) throw new SkipRun("skipped", "the community agent is turned off in Settings");
    if (settings.get("global").paused) throw new SkipRun("skipped", "the Studio is paused (kill switch)");
    const warm = settings.get("global").warmup_until;
    if (warm && ctx.now.toISOString().slice(0, 10) <= warm) throw new SkipRun("skipped", `the warm-up runs until ${warm}: no replies are pulled before then`);

    const last = (await store.runs({ agent: "community", outcome: "ok", limit: 1 }))[0];
    const since = last ? new Date(last.started_at) : new Date(ctx.now.getTime() - 24 * 3600_000);
    let pulled = 0;
    for (const platform of conf.platforms) {
      try {
        const items = await pull(platform, since);
        const inserted = await store.insertReplies(items);
        pulled += inserted.length;
      } catch (err) {
        log.note(`${platform}: comments not pulled (${err instanceof Error ? err.message : String(err)})`);
      }
    }
    log.count("studio_replies", 0);
    log.note(`${pulled} new comments`);

    const unsorted = (await store.replies({ statuses: ["draft"], since: new Date(ctx.now.getTime() - 3 * 86400_000).toISOString(), limit: conf.items_max })).filter((r) => r.klass === null);
    if (unsorted.length === 0) return { outcome: "ok" as const };
    if (!ctx.transport) throw new Error("no model transport: ANTHROPIC_API_KEY is not set");
    for (const use of ["community-classify", "community-draft"] as const) {
      const cap = await modelCap(store, settings, use, ctx.now);
      if (!cap.ok) throw new SkipRun("capped", cap.reason ?? "over the cap");
    }
    await classify(ctx, unsorted, log);
    const toDraft = (await store.replies({ statuses: ["draft"], limit: conf.items_max })).filter((r) => r.klass !== null && r.draft_reply === null);
    const run4 = limiter(4);
    await Promise.all(toDraft.map((row) => run4(() => draftOne(ctx, row, log))));
    return { outcome: "ok" as const };
  });
}
