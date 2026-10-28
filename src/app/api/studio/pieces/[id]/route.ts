import { z } from "zod/v4";
import { body, HttpError, route } from "@/studio/server/api";
import { dispatchWorker, githubFromEnv } from "@/studio/schedule/github";
import { editPiece, markPosted, rewrite } from "@/studio/views/actions";
import { pieceDetail } from "@/studio/views/detail";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export const GET = route<{ id: string }>(async ({ ctx, params }) => {
  const d = await pieceDetail(ctx, params.id);
  if (!d) throw new HttpError(404, "no such piece");
  return d;
});

const slide = z.object({ heading: z.string().max(200), body: z.string().max(600) });
export const PATCH = route<{ id: string }>(async ({ req, ctx, params }) => {
  const edit = await body(
    req,
    z.object({
      script: z.string().max(3000).nullable().optional(),
      lines: z.array(z.string().max(200)).max(12).nullable().optional(),
      caption: z.string().max(5000).nullable().optional(),
      title: z.string().max(300).nullable().optional(),
      description: z.string().max(5000).nullable().optional(),
      tags: z.array(z.string().max(80)).max(30).optional(),
      slides: z.array(slide).max(12).nullable().optional(),
    }),
  );
  return editPiece(ctx, params.id, edit);
});

export const POST = route<{ id: string }>(async ({ req, ctx, params }) => {
  const input = await body(req, z.discriminatedUnion("action", [z.object({ action: z.literal("rewrite"), instruction: z.string().min(3).max(2000) }), z.object({ action: z.literal("posted"), url: z.string().max(500) }), z.object({ action: z.literal("post-now") })]));
  if (input.action === "rewrite") return rewrite(ctx, params.id, input.instruction);
  if (input.action === "posted") {
    await markPosted(ctx, params.id, input.url);
    return { ok: true };
  }
  // Post now: the publish worker for this one piece, every check kept (approval, gate, connection).
  const gh = githubFromEnv(ctx.settings.get("global").branch);
  if (!gh) throw new HttpError(503, "GITHUB_STUDIO_TOKEN isn't set, so nothing can be dispatched");
  if (ctx.settings.get("global").paused) throw new HttpError(409, "the Studio is paused");
  await ctx.store.updatePosts([params.id], { confirmed_at: ctx.now.toISOString() }, "owner");
  await dispatchWorker(gh, "publish", { postIds: [params.id], trigger: "dispatch" });
  return { ok: true };
});
