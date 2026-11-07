import { z } from "zod/v4";
import { body, HttpError, route } from "@/studio/server/api";
import { testWriterPrompt } from "@/studio/agents/writers";
import { PROMPTS_V1, type PromptAgent } from "@/studio/prompts/texts";
import { withRun } from "@/studio/run";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const AGENTS = Object.keys(PROMPTS_V1) as PromptAgent[];
const agentSchema = z.enum(AGENTS as [PromptAgent, ...PromptAgent[]]);

/** Every version of one agent's prompt, newest first, with version 1 from the repository. */
export const GET = route(async ({ ctx, url }) => {
  const agent = agentSchema.parse(url.searchParams.get("agent"));
  const rows = await ctx.store.prompts(agent);
  return { agent, versions: [...rows.map((r) => ({ version: r.version, text: r.text, note: r.note, createdAt: r.created_at, createdBy: r.created_by })), { version: 1, text: PROMPTS_V1[agent], note: "the repository's prompt", createdAt: null, createdBy: "builder" }] };
});

/** Save a new version, or test a draft on one card without saving anything. */
export const POST = route(async ({ req, ctx }) => {
  const input = await body(req, z.discriminatedUnion("action", [z.object({ action: z.literal("save"), agent: agentSchema, text: z.string().min(50).max(60_000), note: z.string().max(300).nullable().optional() }), z.object({ action: z.literal("test"), agent: agentSchema, text: z.string().min(50).max(60_000), cardId: z.string() })]));
  if (input.action === "save") return { version: await ctx.store.savePrompt(input.agent, input.text, input.note ?? null, "owner") };
  if (input.agent !== "writer-en" && input.agent !== "writer-fr") throw new HttpError(400, "a test on one card is for the writers; the other agents are tested with Run now");
  const card = (await ctx.store.cards({ ids: [input.cardId] }))[0];
  if (!card) throw new HttpError(404, "no such card");
  let out: Awaited<ReturnType<typeof testWriterPrompt>> | null = null;
  const run = await withRun(ctx.store, { agent: "interactive", trigger: "interactive", details: { action: "test prompt", agent: input.agent, card: card.id } }, async (log) => {
    out = await testWriterPrompt(ctx, input.agent === "writer-fr" ? "fr" : "en", input.text, card, log);
  });
  if (run.outcome === "failed") throw new HttpError(400, run.error ?? "the test failed");
  return { ...(out ?? {}), tokens: { input: run.log.usage.inputTokens, output: run.log.usage.outputTokens, cached: run.log.usage.cacheReadTokens } };
});
