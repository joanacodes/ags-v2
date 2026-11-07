/**
 * GET  /api/study/decoys — how far the fake charts and their statements are (owner only).
 * POST /api/study/decoys — one step of preparing them; the Study page repeats it until all are ready.
 */
import { NextResponse } from "next/server";
import { getServerUserId } from "@/lib/supabase/server";
import { fakeChartsStatus, isStudyOwner, prepareFakeChartsStep, problemResponse } from "@/server/study-flow";

export const maxDuration = 120;

export async function GET() {
  const userId = await getServerUserId();
  if (!isStudyOwner(userId)) {
    return NextResponse.json({ error: { code: "OWNER_ONLY", message: "Only the study's owner can see this." } }, { status: 403 });
  }
  const outcome = await fakeChartsStatus(userId);
  if (!outcome.ok) {
    const { status, body } = problemResponse(outcome.problem, outcome.detail);
    return NextResponse.json(body, { status });
  }
  return NextResponse.json(outcome.value);
}

export async function POST() {
  const userId = await getServerUserId();
  if (!isStudyOwner(userId)) {
    return NextResponse.json({ error: { code: "OWNER_ONLY", message: "Only the study's owner can do this." } }, { status: 403 });
  }
  const outcome = await prepareFakeChartsStep(userId);
  if (!outcome.ok) {
    const { status, body } = problemResponse(outcome.problem, outcome.detail);
    return NextResponse.json(body, { status });
  }
  return NextResponse.json(outcome.value);
}
