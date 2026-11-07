import { z } from "zod/v4";
import { body, route } from "@/studio/server/api";
import { DEFAULT_KIT_YAML } from "@/studio/kit/default-kit";
import { parseKit } from "@/studio/kit/load";
import { saveKit } from "@/studio/views/control";

export const dynamic = "force-dynamic";

export const GET = route(async ({ ctx, url }) => {
  const versions = await ctx.store.kitVersions(30);
  const asked = Number(url.searchParams.get("version") ?? NaN);
  const chosen = Number.isFinite(asked) ? versions.find((v) => v.version === asked) : versions[0];
  const yaml = chosen?.yaml ?? DEFAULT_KIT_YAML;
  const parsed = parseKit(yaml);
  return {
    yaml,
    version: chosen?.version ?? 1,
    inUse: ctx.kitVersion,
    versions: [...versions.map((v) => ({ version: v.version, note: v.note, createdAt: v.created_at, createdBy: v.created_by })), { version: 1, note: "the repository's kit", createdAt: null, createdBy: "builder" }],
    problems: parsed.problems,
  };
});

/** Check without saving (the editor's live lint), or save a new version. */
export const PUT = route(async ({ req, ctx }) => {
  const input = await body(req, z.object({ yaml: z.string().min(10).max(400_000), note: z.string().max(300).nullable().optional(), check: z.boolean().optional() }));
  if (input.check) {
    const parsed = parseKit(input.yaml);
    return { ok: parsed.ok, version: null, problems: parsed.problems };
  }
  const result = await saveKit(ctx, input.yaml, input.note ?? null);
  return Response.json(result, { status: result.ok ? 200 : 422 });
});
