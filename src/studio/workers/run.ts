/**
 * One worker from the command line: what each GitHub workflow runs, and what a laptop dry run uses.
 *
 *   npm run worker -- strategist            (Sunday's cards and pieces)
 *   npm run worker -- render --posts a,b    (media for chosen pieces)
 *   npm run worker -- publish --posts a     (post one piece now, with every check kept)
 *
 * The outcome is printed and the process exits 1 when the run failed, so the workflow shows red.
 */
import path from "node:path";
import { contextFromEnv } from "../server/context";
import { commentPull } from "../outbox/community";
import { runPublish } from "../outbox/publish";
import { runAnalyst } from "../agents/analyst";
import { runCommunity } from "../agents/community";
import { runStrategist } from "../agents/strategist";
import { runMetrics } from "../metrics/worker";
import { runRender } from "../render/render";
import { runSky } from "../inputs/sky";
import { runSources } from "../inputs/sources";
import { runMaintenance } from "./maintenance";
import { WORKERS, type WorkerId } from "../nodes";
import { RUN_TRIGGERS, type RunTrigger } from "../types";

function arg(name: string, args: readonly string[]): string | null {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? (args[i + 1] ?? null) : null;
}

async function main(): Promise<number> {
  const [worker, ...args] = process.argv.slice(2);
  if (!worker || !(WORKERS as readonly string[]).includes(worker)) {
    console.error(`usage: npm run worker -- <${WORKERS.join("|")}> [--posts id,id] [--week 2026-W46] [--no-write]`);
    return 2;
  }
  const triggerArg = arg("trigger", args) ?? process.env.STUDIO_TRIGGER ?? "dispatch";
  const trigger: RunTrigger = (RUN_TRIGGERS as readonly string[]).includes(triggerArg) ? (triggerArg as RunTrigger) : "dispatch";
  const ctx = await contextFromEnv(trigger);
  const postIds = (arg("posts", args) ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  console.log(`[studio] ${worker} · ${ctx.dryRun ? "dry run (STUDIO_LIVE is off)" : "live"} · kit v${ctx.kitVersion}`);
  const run = async (w: WorkerId) => {
    switch (w) {
      case "strategist":
        return runStrategist(ctx, { write: !args.includes("--no-write"), week: arg("week", args) ?? undefined });
      case "community":
        return runCommunity(ctx, commentPull(ctx));
      case "analyst":
        return runAnalyst(ctx);
      case "metrics":
        return runMetrics(ctx);
      case "render":
        return runRender(ctx, { postIds: postIds.length ? postIds : undefined, publicDir: path.resolve("public/studio"), workRoot: path.resolve(".studio-work") });
      case "publish":
        return runPublish(ctx, { postIds: postIds.length ? postIds : undefined });
      case "sky":
        return runSky(ctx);
      case "sources":
        return runSources(ctx);
      case "maintenance":
        return runMaintenance(ctx);
    }
  };
  const result = await run(worker as WorkerId);
  // The notes were printed as they happened; this is the line the workflow's summary shows.
  console.log(`[studio] ${worker}: ${result.outcome}${result.error ? ` — ${result.error}` : ""}`);
  return result.outcome === "failed" ? 1 : 0;
}

main().then(
  (code) => process.exit(code),
  (err: unknown) => {
    console.error(`[studio] ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`);
    process.exit(1);
  },
);
