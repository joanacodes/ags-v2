import { z } from "zod/v4";
import { body, ids, route } from "@/studio/server/api";
import { dispatchWorker, githubFromEnv } from "@/studio/schedule/github";
import { approvePieces, confirmPieces, killPieces, reschedulePieces, rerenderPieces } from "@/studio/views/actions";

export const dynamic = "force-dynamic";

export const POST = route(async ({ req, ctx, ownerId }) => {
  const input = await body(req, z.object({ action: z.enum(["approve", "kill", "confirm", "rerender", "reschedule"]), ids, at: z.string().optional() }));
  switch (input.action) {
    case "approve":
      return approvePieces(ctx, input.ids, ownerId);
    case "kill":
      return killPieces(ctx, input.ids);
    case "confirm":
      return confirmPieces(ctx, input.ids, ownerId);
    case "reschedule":
      return reschedulePieces(ctx, input.ids, input.at ?? "");
    case "rerender": {
      const result = await rerenderPieces(ctx, input.ids);
      const gh = githubFromEnv(ctx.settings.get("global").branch);
      const changed = input.ids.filter((id) => !result.skipped.some((s) => s.id === id));
      if (gh && changed.length && !ctx.settings.get("global").paused) await dispatchWorker(gh, "render", { postIds: changed, trigger: "dispatch" });
      return { ...result, dispatched: !!gh && changed.length > 0 };
    }
  }
});
