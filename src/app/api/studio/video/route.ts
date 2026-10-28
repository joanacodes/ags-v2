import { z } from "zod/v4";
import { body, HttpError, route } from "@/studio/server/api";
import { dispatchWorker, githubFromEnv } from "@/studio/schedule/github";
import { nextWeek, parisWeek } from "@/studio/time";
import { PILLARS, PLATFORMS } from "@/studio/types";
import { rerenderPieces } from "@/studio/views/actions";
import { checkVideo, newVideo, previewTimeline, previewVoice, saveVideo, sendVideoTo, videoState } from "@/studio/views/video";
import { videoSpecSchema } from "@/studio/video/spec";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export const GET = route(async ({ ctx, url }) => videoState(ctx, url.searchParams.get("piece")));

export const POST = route(async ({ req, ctx }) => {
  const input = await body(
    req,
    z.discriminatedUnion("action", [
      z.object({ action: z.literal("estimate"), spec: z.unknown() }),
      z.object({ action: z.literal("check"), pieceId: z.string().nullable(), spec: z.unknown() }),
      z.object({ action: z.literal("voice"), spec: z.unknown() }),
      z.object({ action: z.literal("save"), pieceId: z.string(), spec: z.unknown() }),
      z.object({ action: z.literal("render"), pieceId: z.string() }),
      z.object({ action: z.literal("preset"), name: z.string().min(1).max(80), spec: z.unknown() }),
      z.object({ action: z.literal("new"), platform: z.enum(PLATFORMS), language: z.enum(["en", "fr"]), pillar: z.enum(PILLARS), hook: z.string().min(3).max(300), script: z.string().min(10).max(3000), template: z.string() }),
      z.object({ action: z.literal("send"), pieceId: z.string(), platforms: z.array(z.string()).min(1).max(12) }),
    ]),
  );
  switch (input.action) {
    case "estimate":
      return { timeline: previewTimeline(videoSpecSchema.parse(input.spec)) };
    case "check":
      return checkVideo(ctx, input.pieceId, input.spec);
    case "voice":
      return previewVoice(ctx, input.spec);
    case "save":
      return saveVideo(ctx, input.pieceId, input.spec);
    case "render": {
      const r = await rerenderPieces(ctx, [input.pieceId]);
      if (r.changed === 0) throw new HttpError(409, r.skipped[0]?.why ?? "it can't be rendered");
      const gh = githubFromEnv(ctx.settings.get("global").branch);
      if (!gh) throw new HttpError(503, "GITHUB_STUDIO_TOKEN isn't set: the nightly render will pick it up");
      await dispatchWorker(gh, "render", { postIds: [input.pieceId], trigger: "dispatch" });
      return { ok: true };
    }
    case "preset": {
      const spec = videoSpecSchema.parse(input.spec);
      const { script: _s, lines: _l, ...look } = spec;
      return ctx.store.saveTemplate({ base: spec.template, name: input.name, spec: look as Record<string, unknown>, is_default: false });
    }
    case "new":
      return newVideo(ctx, { ...input, week: nextWeek(parisWeek(ctx.now)) });
    case "send":
      return sendVideoTo(ctx, input.pieceId, input.platforms);
  }
});
