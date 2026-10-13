/**
 * POST /api/jobs/run — called every minute by the Cloudflare timer
 * (worker.ts → scheduled) to write queued readings. Only accepted with the
 * server's CRON_SECRET.
 */
import { NextResponse } from "next/server";
import { GenerationJobs } from "@/server/generation-jobs";

export const dynamic = "force-dynamic";
export const maxDuration = 800;

/**
 * A few readings per timer run, then the next run (a minute later) carries
 * on. Each reading makes about 7 outside requests (database + AI), and on
 * Cloudflare's free plan a run may make only 50: writing them all in one
 * run used to stop after 7 or 8. Short runs also stay far from the 15-minute
 * limit (a deep reading can take several minutes).
 */
const MAX_READINGS_PER_RUN = 3;
const BUDGET_MS = 2 * 60 * 1000;

export async function POST(request: Request) {
  const secret = (process.env.CRON_SECRET ?? "").trim();
  if (secret === "" || request.headers.get("x-ags-cron") !== secret) {
    return NextResponse.json({ error: { code: "FORBIDDEN", message: "Forbidden." } }, { status: 403 });
  }
  const result = await GenerationJobs.runQueue(BUDGET_MS, MAX_READINGS_PER_RUN);
  return NextResponse.json(result);
}
