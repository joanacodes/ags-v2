/**
 * POST /api/jobs/run — called every minute by the Cloudflare timer
 * (worker.ts → scheduled) to write queued readings. Only accepted with the
 * server's CRON_SECRET.
 */
import { NextResponse } from "next/server";
import { GenerationJobs } from "@/server/generation-jobs";

export const dynamic = "force-dynamic";
export const maxDuration = 800;

/** Stop picking new readings after 8 min: a started one may take ~4 more. */
const BUDGET_MS = 8 * 60 * 1000;

export async function POST(request: Request) {
  const secret = (process.env.CRON_SECRET ?? "").trim();
  if (secret === "" || request.headers.get("x-ags-cron") !== secret) {
    return NextResponse.json({ error: { code: "FORBIDDEN", message: "Forbidden." } }, { status: 403 });
  }
  const result = await GenerationJobs.runQueue(BUDGET_MS);
  return NextResponse.json(result);
}
