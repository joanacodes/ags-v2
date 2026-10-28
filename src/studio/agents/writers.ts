/**
 * The writers, English and French: one call per card and language, every piece the card's targets ask
 * for, each written for its platform. Then the code composes the final text, runs the gate, gives the
 * writer one retry naming what failed, plans the slots and saves the pieces as drafts. On Sunday, more
 * than twenty calls go through the Message Batches API at half price, with direct calls for whatever
 * the batch hasn't finished by the deadline.
 */
import type { AgentContext } from "./context";
import { promptFor } from "./context";
import { writerSystem } from "./system";
import { callStructured, StructuredCallError, type StructuredResult } from "../claude/call";
import { describeIssues, toApiSchema } from "../claude/schema";
import { limiter } from "../claude/limit";
import { writerOut, type PieceOut, type WriterOut } from "../prompts/schemas";
import { costOf } from "../models";
import type { ModelUse } from "../models";
import { modelCap } from "../caps";
import type { RunLog } from "../run";
import { assignTargets, type Target } from "../pieces/targets";
import { composePiece, gateInputOf } from "../pieces/compose";
import { checkText, describeFailures, type GateChecks } from "../gate/text";
import { planSlots, mediumDate, type SlotRequest } from "../schedule/slots";
import { daysOf, fromParis, parisDate } from "../time";
import type { CardRow, GateResult } from "../store/rows";
import type { NewPost } from "../store/store";
import type { Language } from "../types";
import { FORMAT_LABELS, PLATFORM_LABELS } from "../types";

interface Job {
  readonly card: CardRow;
  readonly language: Language;
  readonly targets: Target[];
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function cardBlock(card: CardRow): string {
  return JSON.stringify(
    {
      pillar: card.pillar,
      idea: card.idea,
      hook: card.hook,
      points: card.points,
      figures: card.figures.filter((f) => f.verified).map((f) => ({ value: f.value, label: f.label, source: f.source })),
      call_to_action: card.cta,
      anchor: card.anchor,
      date: card.sky_date,
    },
    null,
    2,
  );
}

export function writerUser(job: Job, keywordActive: boolean): string {
  const list = job.targets.map((t) => `- ${t.format} for ${PLATFORM_LABELS[t.platform]} (platform "${t.platform}", format "${t.format}")`).join("\n");
  return [
    `<card>\n${cardBlock(job.card)}\n</card>`,
    `<write>\nWrite exactly these pieces, one each, in ${job.language === "fr" ? "French" : "English"}:\n${list}\n</write>`,
    keywordActive ? "" : "<keyword>Before the keyword date: no \"comment TEST\" or \"reply TEST\" in any piece.</keyword>",
  ]
    .filter(Boolean)
    .join("\n\n");
}

/** Every target written exactly once, with the fields its format needs. */
export function checkPieces(out: WriterOut, targets: readonly Target[]): string[] {
  const problems: string[] = [];
  for (const t of targets) {
    const n = out.pieces.filter((p) => p.platform === t.platform && p.format === t.format).length;
    if (n === 0) problems.push(`missing: the ${t.format} for ${t.platform}`);
    if (n > 1) problems.push(`the ${t.format} for ${t.platform} is written ${n} times; write it once`);
  }
  for (const p of out.pieces) {
    if (!targets.some((t) => t.platform === p.platform && t.format === p.format)) problems.push(`not asked for: the ${p.format} for ${p.platform}`);
    const need = (cond: boolean, what: string) => {
      if (!cond) problems.push(`the ${p.format} for ${p.platform} needs ${what}`);
    };
    switch (p.format) {
      case "video":
        need(!!p.script?.trim(), "a script");
        need(!!p.lines?.length, "on-screen lines");
        need(p.platform === "youtube" ? !!p.title?.trim() : !!p.caption?.trim(), p.platform === "youtube" ? "a title" : "a caption");
        if (p.template === "test-three-cards") need((p.statements?.length ?? 0) === 3, "three statements");
        break;
      case "carousel":
        need((p.slides?.length ?? 0) >= 5, "5 to 7 slides");
        need(!!p.caption?.trim(), "a caption");
        break;
      case "text":
        need(!!p.caption?.trim(), "its text in caption");
        break;
      case "pin":
        need(!!p.title?.trim() && !!p.description?.trim(), "a title and a description");
        break;
      case "story":
        need(!!p.lines?.length, "its lines");
        break;
      case "issue":
        need(!!p.title?.trim() && !!p.description?.trim(), "a title and its body in description");
        break;
      default:
        break;
    }
  }
  return problems;
}

function modelUseOf(language: Language): ModelUse {
  return language === "fr" ? "writer-fr" : "writer-en";
}

interface Written {
  readonly job: Job;
  readonly pieces: PieceOut[];
}

/** A Message Batch for the jobs of one language; returns what succeeded and validated, by job index. */
async function viaBatch(ctx: AgentContext, jobs: readonly Job[], system: ReturnType<typeof writerSystem>, keywordActive: (j: Job) => boolean, deadline: Date, log: RunLog): Promise<Map<number, PieceOut[]>> {
  const out = new Map<number, PieceOut[]>();
  if (!ctx.transport || jobs.length === 0) return out;
  const language = jobs[0]!.language;
  const conf = ctx.settings.model(modelUseOf(language));
  const schema = toApiSchema(writerOut);
  const id = await ctx.transport.submitBatch(
    jobs.map((job, i) => ({
      customId: `job-${i}`,
      request: { model: conf.model, maxTokens: conf.max_tokens, effort: conf.effort, system, user: writerUser(job, keywordActive(job)), schema, fallbacks: false },
    })),
  );
  log.note(`batch ${id}: ${jobs.length} ${language} cards submitted`);
  log.details[`batch_${language}`] = id;
  for (;;) {
    const status = await ctx.transport.batchStatus(id);
    if (status.ended) break;
    if (Date.now() >= deadline.getTime()) {
      log.note(`batch ${id} not finished by the deadline: the rest go direct`);
      await ctx.transport.cancelBatch(id).catch(() => undefined);
      break;
    }
    await sleep(Math.min(60_000, Math.max(5_000, deadline.getTime() - Date.now())));
  }
  const results = await ctx.transport.batchResults(id).catch(() => []);
  for (const r of results) {
    const i = Number(r.customId.replace("job-", ""));
    const job = jobs[i];
    if (!job || !r.ok) continue;
    log.add(r.response.usage, costOf(r.response.model || conf.model, r.response.usage, { batch: true }), r.response.model);
    let json: unknown;
    try {
      json = JSON.parse(r.response.text);
    } catch {
      continue;
    }
    const parsed = writerOut.safeParse(json);
    if (!parsed.success) {
      log.note(`batch answer for "${job.card.hook.slice(0, 40)}" (${language}) failed its schema: ${describeIssues(parsed.error, 3).join("; ")}`);
      continue;
    }
    if (checkPieces(parsed.data, job.targets).length) continue;
    out.set(i, parsed.data.pieces);
  }
  return out;
}

async function direct(ctx: AgentContext, job: Job, system: ReturnType<typeof writerSystem>, user: string, log: RunLog): Promise<PieceOut[] | null> {
  if (!ctx.transport) return null;
  const conf = ctx.settings.model(modelUseOf(job.language));
  let result: StructuredResult<WriterOut>;
  try {
    result = await callStructured({
      transport: ctx.transport,
      model: conf.model,
      effort: conf.effort,
      maxTokens: conf.max_tokens,
      fallbacks: conf.fallbacks,
      system,
      user,
      schema: writerOut,
      check: (out) => checkPieces(out, job.targets),
      overloadModel: "claude-haiku-5-5",
    });
  } catch (err) {
    if (err instanceof StructuredCallError) log.add(err.usage, err.costUsd);
    log.note(`the ${job.language} writer failed on "${job.card.hook.slice(0, 50)}": ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
  log.add(result.usage, result.costUsd, result.model);
  if (result.model !== conf.model) log.note(`"${job.card.hook.slice(0, 40)}" was written by ${result.model}`);
  return result.value.pieces.filter((p) => job.targets.some((t) => t.platform === p.platform && t.format === p.format));
}

interface Composed {
  readonly job: Job;
  readonly post: NewPost;
  readonly gate: GateResult;
}

/**
 * Where the writers' spend is booked: one run per writer, so each writer's weekly cap reads its own
 * spend (and the strategist's cap reads the strategist's alone). A single log is accepted for an
 * interactive call that writes one card.
 */
export type WriterLogs = RunLog | { readonly en: RunLog; readonly fr: RunLog };
const logOf = (logs: WriterLogs, language: Language): RunLog => ("en" in logs && "fr" in logs ? logs[language] : (logs as RunLog));

export async function writeCards(ctx: AgentContext, cards: readonly CardRow[], logs: WriterLogs, options: { replaceExisting?: boolean; runId?: string } = {}): Promise<{ pieces: number; failed: number; unscheduled: number }> {
  const log = logOf(logs, "en");
  const { store, settings, kit, now } = ctx;
  if (cards.length === 0) return { pieces: 0, failed: 0, unscheduled: 0 };
  const week = cards[0]!.week;
  const keywordFrom = settings.get("global").keyword_from;
  const gateChecks = settings.get("gate").checks as GateChecks;

  // What this week already holds (the backlog carried over, earlier runs) counts against its room.
  const existing = await store.posts({ scheduledFrom: fromParis(daysOf(week)[0]!, "00:00").toISOString(), scheduledTo: fromParis(daysOf(week)[6]!, "23:59").toISOString() });
  const others = existing.filter((p) => !cards.some((c) => c.id === p.card_id) && p.status !== "killed");
  const taken = new Map<string, number>();
  for (const p of others) taken.set(`${p.platform}|${p.format}`, (taken.get(`${p.platform}|${p.format}`) ?? 0) + 1);
  const targets = assignTargets(cards, kit, settings, week, taken);

  const jobs: Job[] = [];
  for (const card of cards) {
    const ts = targets.get(card.id) ?? [];
    for (const language of ["en", "fr"] as const) {
      if (!settings.get(language === "en" ? "writer-en" : "writer-fr").enabled) continue;
      const mine = ts.filter((t) => t.language === language);
      if (mine.length) jobs.push({ card, language, targets: mine });
    }
  }
  if (jobs.length === 0) return { pieces: 0, failed: 0, unscheduled: 0 };

  for (const language of ["en", "fr"] as const) {
    const cap = await modelCap(store, settings, modelUseOf(language), now);
    if (!cap.ok) {
      logOf(logs, language).note(`the ${language} writer is capped: ${cap.reason}`);
      for (let i = jobs.length - 1; i >= 0; i -= 1) if (jobs[i]!.language === language) jobs.splice(i, 1);
    }
  }

  const keywordActive = (job: Job) => !keywordFrom || (job.card.sky_date ?? daysOf(week)[6]!) >= keywordFrom;
  const systems = {
    en: writerSystem((await promptFor(store, "writer-en", settings.get("writer-en").prompt_version)).text, kit, "en"),
    fr: writerSystem((await promptFor(store, "writer-fr", settings.get("writer-fr").prompt_version)).text, kit, "fr"),
  };

  const written: Written[] = [];
  const pending = new Set(jobs.map((_, i) => i));
  for (const language of ["en", "fr"] as const) {
    const conf = settings.get(language === "en" ? "writer-en" : "writer-fr");
    const indexes = jobs.map((j, i) => (j.language === language ? i : -1)).filter((i) => i >= 0);
    if (conf.use_batches && indexes.length > 20 && ctx.transport) {
      const today = parisDate(now);
      let deadline = fromParis(today, conf.batch_deadline);
      if (deadline.getTime() - now.getTime() < 30 * 60_000) deadline = new Date(now.getTime() + 60 * 60_000);
      const done = await viaBatch(ctx, indexes.map((i) => jobs[i]!), systems[language], keywordActive, deadline, logOf(logs, language)).catch((err) => {
        logOf(logs, language).note(`the ${language} batch failed (${err instanceof Error ? err.message : String(err)}): writing directly`);
        return new Map<number, PieceOut[]>();
      });
      for (const [k, pieces] of done) {
        const i = indexes[k]!;
        written.push({ job: jobs[i]!, pieces });
        pending.delete(i);
      }
    }
  }
  const run4 = limiter(4);
  const directs = await Promise.all(
    [...pending].map((i) =>
      run4(async () => {
        const job = jobs[i]!;
        const pieces = await direct(ctx, job, systems[job.language], writerUser(job, keywordActive(job)), logOf(logs, job.language));
        return pieces ? { job, pieces } : null;
      }),
    ),
  );
  for (const w of directs) if (w) written.push(w);

  // Compose, gate, and give each card one retry for the pieces that failed.
  const composed: Composed[] = [];
  const retries: { job: Job; failing: { piece: PieceOut; gate: GateResult }[] }[] = [];
  for (const w of written) {
    const failing: { piece: PieceOut; gate: GateResult }[] = [];
    for (const piece of w.pieces) {
      const post = composePiece(piece, w.job.card, w.job.language, { kit, keywordActive: keywordActive(w.job) });
      const gate = checkText(gateInputOf({ ...post, script: post.script ?? null, lines: post.lines ?? null, caption: post.caption ?? null, title: post.title ?? null, description: post.description ?? null, tags: post.tags ?? [], slides: post.slides ?? null, disclosure: post.disclosure ?? false, spec: post.spec ?? null }, w.job.card, kit), kit, gateChecks, now);
      if (gate.ok) composed.push({ job: w.job, post: { ...post, gate }, gate });
      else failing.push({ piece, gate });
    }
    if (failing.length) retries.push({ job: w.job, failing });
  }
  await Promise.all(
    retries.map((r) =>
      run4(async () => {
        const targets = r.failing.map((f) => ({ platform: f.piece.platform, format: f.piece.format, language: r.job.language }));
        const job: Job = { ...r.job, targets };
        const problems = r.failing.flatMap((f) => describeFailures(f.gate).map((line) => `${f.piece.format} for ${f.piece.platform}: ${line}`));
        const user = `${writerUser(job, keywordActive(job))}\n\n<gate>\nThese pieces failed the brand's checks. Rewrite each one so every check passes:\n${problems.map((p) => `- ${p}`).join("\n")}\n</gate>`;
        const again = await direct(ctx, job, systems[job.language], user, logOf(logs, job.language));
        for (const f of r.failing) {
          const redo = again?.find((p) => p.platform === f.piece.platform && p.format === f.piece.format);
          const piece = redo ?? f.piece;
          const post = composePiece(piece, job.card, job.language, { kit, keywordActive: keywordActive(job) });
          const gate = checkText(gateInputOf({ ...post, script: post.script ?? null, lines: post.lines ?? null, caption: post.caption ?? null, title: post.title ?? null, description: post.description ?? null, tags: post.tags ?? [], slides: post.slides ?? null, disclosure: post.disclosure ?? false, spec: post.spec ?? null }, job.card, kit), kit, gateChecks, now);
          composed.push({ job, post: { ...post, gate, status: gate.ok ? "draft" : "failed" }, gate });
        }
      }),
    ),
  );

  // Slots for everything that passed (a failed piece waits for the owner on Today).
  const requests: SlotRequest[] = composed
    .map((c, i) => ({ c, i }))
    .filter(({ c }) => c.gate.ok)
    .map(({ c, i }) => ({ key: String(i), platform: c.post.platform, format: c.post.format, pillar: c.job.card.pillar, skyDate: c.job.card.sky_date }));
  const slots = planSlots(
    requests,
    week,
    kit,
    settings,
    others.filter((p) => p.scheduled_at).map((p) => ({ platform: p.platform, format: p.format, at: p.scheduled_at! })),
    now,
  );
  const rows: NewPost[] = composed.map((c, i) => ({ ...c.post, scheduled_at: slots.get(String(i)) ?? null, run_id: options.runId ?? null }));

  // Medium takes each Substack issue fourteen days later, by hand, with its own src tag.
  for (const r of [...rows]) {
    if (r.platform === "substack" && r.scheduled_at) {
      rows.push({
        ...r,
        platform: "medium",
        description: (r.description ?? "").replace(/\?src=sub\b/g, "?src=med"),
        scheduled_at: mediumDate(r.scheduled_at, kit),
        by_hand: true,
      });
    }
  }

  if (options.replaceExisting) {
    const old = existing.filter((p) => cards.some((c) => c.id === p.card_id) && (p.status === "draft" || p.status === "failed"));
    if (old.length) await store.updatePosts(old.map((p) => p.id), { status: "killed", error: "replaced by a new writing" }, "writer");
  }
  const saved = await store.insertPosts(rows, "writer");
  log.count("studio_posts", saved.length);
  const failed = saved.filter((p) => p.status === "failed").length;
  const unscheduled = saved.filter((p) => p.status !== "failed" && !p.scheduled_at).length;
  for (const job of jobs) {
    const got = saved.filter((p) => p.card_id === job.card.id && p.language === job.language).length;
    if (got < job.targets.length) log.note(`"${job.card.hook.slice(0, 50)}" (${job.language}): ${got} of ${job.targets.length} pieces written`);
  }
  log.details["pieces_by_format"] = Object.fromEntries(
    Object.entries(saved.reduce<Record<string, number>>((acc, p) => ({ ...acc, [FORMAT_LABELS[p.format]]: (acc[FORMAT_LABELS[p.format]] ?? 0) + 1 }), {})),
  );
  return { pieces: saved.length, failed, unscheduled };
}

/**
 * The owner's "Rewrite" on one piece: the writer again, for that platform and format alone, with her
 * instruction. The piece keeps its slot; it goes back to draft (or failed, if the gate still says no),
 * and its media are re-rendered at the next render because its words changed.
 */
export async function rewritePiece(ctx: AgentContext, postId: string, instruction: string, log: RunLog): Promise<{ ok: boolean; gate: GateResult | null; message: string }> {
  const { store, kit, settings } = ctx;
  const post = (await store.posts({ ids: [postId] }))[0];
  if (!post) return { ok: false, gate: null, message: "no such piece" };
  const card = (await store.cards({ ids: [post.card_id] }))[0];
  if (!card) return { ok: false, gate: null, message: "the piece's card is gone" };
  if (!ctx.transport) return { ok: false, gate: null, message: "no API key: ANTHROPIC_API_KEY is not set" };
  const cap = await modelCap(store, settings, "rewrite", ctx.now);
  if (!cap.ok) return { ok: false, gate: null, message: cap.reason ?? "over the cap" };
  const conf = settings.model("rewrite");
  const job: Job = { card, language: post.language, targets: [{ platform: post.platform, format: post.format, language: post.language }] };
  const keywordFrom = settings.get("global").keyword_from;
  const keywordActive = !keywordFrom || (post.scheduled_at ?? new Date().toISOString()).slice(0, 10) >= keywordFrom;
  const system = writerSystem((await promptFor(store, post.language === "fr" ? "writer-fr" : "writer-en", null)).text, kit, post.language);
  const current = JSON.stringify({ script: post.script, lines: post.lines, caption: post.caption, title: post.title, description: post.description, slides: post.slides });
  const user = `${writerUser(job, keywordActive)}\n\n<current_piece>\n${current}\n</current_piece>\n\n<owner_instruction>\n${instruction.trim().slice(0, 2000)}\n</owner_instruction>`;
  try {
    const result = await callStructured({ transport: ctx.transport, model: conf.model, effort: conf.effort, maxTokens: conf.max_tokens, fallbacks: conf.fallbacks, system, user, schema: writerOut, check: (out) => checkPieces(out, job.targets) });
    log.add(result.usage, result.costUsd, result.model);
    const piece = result.value.pieces[0]!;
    const composed = composePiece(piece, card, post.language, { kit, keywordActive });
    const gate = checkText(gateInputOf({ ...post, ...composed, script: composed.script ?? null, lines: composed.lines ?? null, caption: composed.caption ?? null, title: composed.title ?? null, description: composed.description ?? null, tags: composed.tags ?? [], slides: composed.slides ?? null, disclosure: composed.disclosure ?? false, spec: composed.spec ?? null }, card, kit), kit, settings.get("gate").checks as GateChecks, ctx.now);
    await store.updatePosts(
      [post.id],
      {
        script: composed.script ?? null,
        lines: composed.lines ?? null,
        caption: composed.caption ?? null,
        title: composed.title ?? null,
        description: composed.description ?? null,
        tags: composed.tags ?? [],
        slides: composed.slides ?? null,
        spec: composed.spec ?? null,
        disclosure: composed.disclosure ?? false,
        gate,
        status: gate.ok ? "draft" : "failed",
        approved_at: null,
        approved_by: null,
        confirmed_at: null,
      },
      "owner",
    );
    const media = await store.media({ postIds: [post.id] });
    if (media.length) await store.deleteMedia(media.map((m) => m.id));
    log.count("studio_posts");
    return { ok: gate.ok, gate, message: gate.ok ? "rewritten" : `rewritten, but the gate still says: ${describeFailures(gate).join("; ")}` };
  } catch (err) {
    if (err instanceof StructuredCallError) log.add(err.usage, err.costUsd);
    return { ok: false, gate: null, message: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Settings → a writer's prompt → "Test on one card": the draft prompt (saved or not) runs once on one
 * card, its pieces go through the gate, and nothing is stored but the run's cost.
 */
export async function testWriterPrompt(
  ctx: AgentContext,
  language: Language,
  promptText: string,
  card: CardRow,
  log: RunLog,
): Promise<{ pieces: { platform: string; format: string; text: string; gateOk: boolean; failures: string[] }[]; costUsd: number; model: string; problems: string[] }> {
  if (!ctx.transport) throw new Error("no API key: ANTHROPIC_API_KEY is not set");
  const cap = await modelCap(ctx.store, ctx.settings, "test-prompt", ctx.now);
  if (!cap.ok) throw new Error(cap.reason ?? "over the cap");
  const targets = (assignTargets([card], ctx.kit, ctx.settings, card.week, new Map()).get(card.id) ?? []).filter((t) => t.language === language);
  if (!targets.length) throw new Error(`this card has no ${language === "en" ? "English" : "French"} pieces to write`);
  const job: Job = { card, language, targets };
  const conf = ctx.settings.model("test-prompt");
  const keywordFrom = ctx.settings.get("global").keyword_from;
  const keywordActive = !keywordFrom || (card.sky_date ?? daysOf(card.week)[6]!) >= keywordFrom;
  const result = await callStructured({ transport: ctx.transport, model: conf.model, effort: conf.effort, maxTokens: conf.max_tokens, fallbacks: conf.fallbacks, system: writerSystem(promptText, ctx.kit, language), user: writerUser(job, keywordActive), schema: writerOut, check: (out) => checkPieces(out, targets), attempts: 1 });
  log.add(result.usage, result.costUsd, result.model);
  const checks = ctx.settings.get("gate").checks as GateChecks;
  const pieces = result.value.pieces.map((piece) => {
    const post = composePiece(piece, card, language, { kit: ctx.kit, keywordActive });
    const gate = checkText(gateInputOf({ ...post, script: post.script ?? null, lines: post.lines ?? null, caption: post.caption ?? null, title: post.title ?? null, description: post.description ?? null, tags: post.tags ?? [], slides: post.slides ?? null, disclosure: post.disclosure ?? false, spec: post.spec ?? null }, card, ctx.kit), ctx.kit, checks, ctx.now);
    const text = [post.title, post.script, post.caption, post.description, ...(post.slides ?? []).map((s) => `${s.heading} — ${s.body}`)].filter(Boolean).join("\n\n");
    return { platform: piece.platform, format: piece.format, text, gateOk: gate.ok, failures: describeFailures(gate) };
  });
  return { pieces, costUsd: result.costUsd, model: result.model, problems: [...result.remaining] };
}
