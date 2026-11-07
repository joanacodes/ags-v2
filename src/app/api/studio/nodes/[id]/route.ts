import { z } from "zod/v4";
import { body, HttpError, route } from "@/studio/server/api";
import { nodeById } from "@/studio/nodes";
import { MODEL_DEFAULTS, MODEL_USES } from "@/studio/models";
import { schemaKeyFor } from "@/studio/settings";
import { saveNodeSettings } from "@/studio/views/control";
import { describeCron } from "@/studio/schedule/cron";
import { isPlatform } from "@/studio/types";

export const dynamic = "force-dynamic";

/** The drawer's contents: the node's settings as they apply now, what the owner stored, and for an agent its model and prompt. */
export const GET = route<{ id: string }>(async ({ ctx, params }) => {
  // "global" is no node on the Map, but its settings (approval mode, the weekly cap) are edited the same way.
  const def = nodeById(params.id) ?? (params.id === "global" ? { id: "global", label: "The Studio", kind: "brand" as const, parent: null, blurb: "Settings for the whole Studio" } : undefined);
  if (!def) throw new HttpError(404, "no such node");
  const key = schemaKeyFor(params.id);
  const settings = key === "platform" && params.id.startsWith("platform-") ? ctx.settings.platform(params.id.slice(9) as never) : key ? ctx.settings.get(key) : null;
  const uses = MODEL_USES.filter((u) => u === params.id || (params.id === "community" && u.startsWith("community-")));
  const prompts = def.kind === "agent" ? (await ctx.store.prompts(params.id === "community" ? "community-draft" : params.id)).map((p) => ({ version: p.version, note: p.note, createdAt: p.created_at, createdBy: p.created_by })) : [];
  const platform = params.id.startsWith("platform-") ? params.id.slice(9) : null;
  const schedule = settings && typeof (settings as Record<string, unknown>)["schedule"] === "string" ? describeCron((settings as Record<string, unknown>)["schedule"] as string) : null;
  return {
    node: def,
    settings,
    stored: ctx.settings.raw(params.id),
    problems: ctx.settings.problems()[params.id] ?? [],
    schedule,
    models: uses.map((u) => ({ use: u, value: ctx.settings.model(u), defaults: MODEL_DEFAULTS[u] })),
    prompts,
    postingMode: platform && isPlatform(platform) ? ctx.settings.postingMode(platform) : null,
  };
});

export const PUT = route<{ id: string }>(async ({ req, ctx, params }) => {
  const input = await body(req, z.object({ settings: z.record(z.string(), z.unknown()).optional(), models: z.record(z.string(), z.unknown()).optional() }));
  const problems: string[] = [];
  if (input.settings && Object.keys(input.settings).length) {
    const r = await saveNodeSettings(ctx, params.id, input.settings);
    problems.push(...r.problems);
  }
  if (input.models && Object.keys(input.models).length) {
    const r = await saveNodeSettings(ctx, "models", input.models);
    problems.push(...r.problems);
  }
  if (problems.length) return Response.json({ ok: false, problems }, { status: 422 });
  return { ok: true };
});

/** The node's place on the Map, saved when the owner drags it. */
export const POST = route<{ id: string }>(async ({ req, ctx, params }) => {
  const p = await body(req, z.object({ x: z.number().finite(), y: z.number().finite(), collapsed: z.boolean().default(false) }));
  if (!nodeById(params.id)) throw new HttpError(404, "no such node");
  await ctx.store.putNodePosition(params.id, Math.round(p.x), Math.round(p.y), p.collapsed);
  return { ok: true };
});
