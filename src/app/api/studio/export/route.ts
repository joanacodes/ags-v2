import { HttpError, route } from "@/studio/server/api";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function csv(rows: readonly Record<string, unknown>[]): string {
  if (!rows.length) return "";
  const cols = [...new Set(rows.flatMap((r) => Object.keys(r)))];
  const cell = (v: unknown) => {
    const s = v === null || v === undefined ? "" : typeof v === "object" ? JSON.stringify(v) : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(","), ...rows.map((r) => cols.map((c) => cell(r[c])).join(","))].join("\r\n") + "\r\n";
}

/** CSV of the work, JSON of the settings and the kit: enough to move or restore the Studio. */
export const GET = route(async ({ ctx, url }) => {
  const what = url.searchParams.get("what") ?? "cards";
  const stamp = ctx.now.toISOString().slice(0, 10);
  const file = (name: string, text: string, type: string) => new Response(text, { headers: { "content-type": type, "content-disposition": `attachment; filename="studio-${name}-${stamp}.${type.includes("json") ? "json" : "csv"}"`, "cache-control": "no-store" } });
  switch (what) {
    case "cards":
      return file("cards", csv(await ctx.store.cards({ limit: 100000 })), "text/csv; charset=utf-8");
    case "pieces":
      return file("pieces", csv((await ctx.store.posts({ limit: 100000 })).map(({ platform_state: _state, ...rest }) => rest)), "text/csv; charset=utf-8");
    case "metrics":
      return file("metrics", csv(await ctx.store.metrics({ from: "2000-01-01", to: "2100-01-01" })), "text/csv; charset=utf-8");
    case "scorecards":
      return file("scorecards", csv(await ctx.store.scorecards(520)), "text/csv; charset=utf-8");
    case "settings": {
      const [settings, kit, prompts] = await Promise.all([ctx.store.allSettings(), ctx.store.latestKit(), ctx.store.prompts()]);
      return file("settings", JSON.stringify({ exported_at: ctx.now.toISOString(), settings, kit: kit ? { version: kit.version, yaml: kit.yaml } : null, prompts }, null, 2), "application/json");
    }
    default:
      throw new HttpError(400, "export cards, pieces, metrics, scorecards or settings");
  }
});
