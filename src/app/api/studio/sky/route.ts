import { z } from "zod/v4";
import { body, route } from "@/studio/server/api";
import { parseIcs } from "@/studio/reminders/ics";

export const dynamic = "force-dynamic";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const POST = route(async ({ req, ctx }) => {
  const input = await body(
    req,
    z.discriminatedUnion("action", [
      z.object({ action: z.literal("sky"), date, time_paris: z.string().regex(/^\d{2}:\d{2}$/).nullable(), kind: z.enum(["ingress", "station", "lunation", "eclipse"]), body: z.string().min(2).max(40), sign: z.string().max(20).nullable(), event: z.string().min(3).max(200), source1: z.string().min(2).max(300), source2: z.string().max(300).nullable() }),
      z.object({ action: z.literal("calendar"), date, event: z.string().min(1).max(200), note: z.string().max(1000).nullable(), remind: z.boolean().default(true) }),
      z.object({ action: z.literal("import"), ics: z.string().min(20).max(500_000) }),
    ]),
  );
  if (input.action === "sky") {
    const { action: _a, ...row } = input;
    await ctx.store.upsertSky([{ ...row, degree: null, created_by: "owner" }]);
    return { ok: true };
  }
  if (input.action === "calendar") {
    await ctx.store.upsertCalendar([{ date: input.date, event: input.event, note: input.note, source: "owner", remind: input.remind }]);
    return { ok: true };
  }
  const rows = parseIcs(input.ics);
  const n = await ctx.store.upsertCalendar(rows.map((r) => ({ ...r, source: "import", remind: true })));
  return { ok: true, imported: n };
});

export const DELETE = route(async ({ ctx, url }) => {
  const id = url.searchParams.get("id") ?? "";
  if (url.searchParams.get("kind") === "calendar") await ctx.store.deleteCalendar(id);
  else await ctx.store.deleteSky(id);
  return { ok: true };
});
