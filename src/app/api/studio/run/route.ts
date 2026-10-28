import { z } from "zod/v4";
import { body, HttpError, route } from "@/studio/server/api";
import { WORKERS } from "@/studio/nodes";
import { dispatchWorker, githubFromEnv, recentRuns } from "@/studio/schedule/github";

export const dynamic = "force-dynamic";

/** Run now: the worker is dispatched to GitHub Actions; its run row appears when it starts. */
export const POST = route(async ({ req, ctx }) => {
  const input = await body(req, z.object({ worker: z.enum(WORKERS), postIds: z.array(z.string()).max(200).optional() }));
  if (ctx.settings.get("global").paused) throw new HttpError(409, "the Studio is paused: restart it in Settings first");
  const gh = githubFromEnv(ctx.settings.get("global").branch);
  if (!gh) throw new HttpError(503, "GITHUB_STUDIO_TOKEN isn't set, so nothing can be dispatched");
  await dispatchWorker(gh, input.worker, { postIds: input.postIds, trigger: "dispatch" });
  await ctx.store.logEvent({ table: "studio_runs", rowId: input.worker, actor: "owner", note: `run now${input.postIds?.length ? ` for ${input.postIds.length} pieces` : ""}` });
  return { ok: true };
});

/** The recent workflow runs, for the Map's "running" and the Runs tab's links. */
export const GET = route(async ({ ctx }) => {
  const gh = githubFromEnv(ctx.settings.get("global").branch);
  return { runs: gh ? await recentRuns(gh).catch(() => []) : [] };
});
