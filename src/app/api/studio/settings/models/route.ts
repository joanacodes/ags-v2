import { z } from "zod/v4";
import { body, route } from "@/studio/server/api";
import { MODEL_DEFAULTS, MODEL_USE_LABELS, MODEL_USES, MODELS_CHECKED, modelTable, currentPriceOverrides } from "@/studio/models";
import { USE_AGENT } from "@/studio/caps";
import { saveNodeSettings } from "@/studio/views/control";

export const dynamic = "force-dynamic";

const LIST_PATH = "cache/models.json";

/** The model list from Anthropic's Models API, cached for a day in Storage so the page never waits on it. */
async function liveModels(ctx: Parameters<Parameters<typeof route>[0]>[0]["ctx"]): Promise<{ fetchedAt: string | null; ids: string[] }> {
  try {
    if (await ctx.storage.exists(LIST_PATH)) {
      const cached = JSON.parse(new TextDecoder().decode(await ctx.storage.download(LIST_PATH))) as { fetchedAt: string; ids: string[] };
      if (ctx.now.getTime() - Date.parse(cached.fetchedAt) < 86400_000) return cached;
    }
    if (!ctx.transport) return { fetchedAt: null, ids: [] };
    const list = await ctx.transport.listModels();
    const fresh = { fetchedAt: ctx.now.toISOString(), ids: list.map((m) => m.id) };
    await ctx.storage.upload(LIST_PATH, new TextEncoder().encode(JSON.stringify(fresh)), "application/json");
    return fresh;
  } catch {
    return { fetchedAt: null, ids: [] };
  }
}

export const GET = route(async ({ ctx }) => {
  const since4w = new Date(ctx.now.getTime() - 28 * 86400_000).toISOString();
  const runs = await ctx.store.runs({ since: since4w, limit: 5000 });
  const live = await liveModels(ctx);
  return {
    checked: MODELS_CHECKED,
    live,
    table: modelTable(currentPriceOverrides()),
    uses: MODEL_USES.map((use) => {
      const mine = runs.filter((r) => r.agent === USE_AGENT[use] && r.outcome !== "skipped");
      const spent = mine.reduce((n, r) => n + r.cost_usd, 0);
      return { use, label: MODEL_USE_LABELS[use], defaults: MODEL_DEFAULTS[use], value: ctx.settings.model(use), perRun: mine.length ? spent / mine.length : null, perWeek: spent / 4 };
    }),
    weeklyCap: ctx.settings.get("global").weekly_cap_usd,
  };
});

/** Price corrections: dollars per million tokens, per model. */
export const PUT = route(async ({ req, ctx }) => {
  const input = await body(req, z.object({ prices: z.record(z.string(), z.record(z.string(), z.number())) }));
  const r = await saveNodeSettings(ctx, "prices", input.prices);
  return Response.json(r, { status: r.ok ? 200 : 422 });
});
