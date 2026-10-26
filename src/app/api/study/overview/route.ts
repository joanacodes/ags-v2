/** GET /api/study/overview — the Study page: today, the fake charts, every result (owner only). */
import { NextResponse } from "next/server";
import { getServerUserId } from "@/lib/supabase/server";
import { isStudyOwner, problemResponse, studyOverview } from "@/server/study-flow";

export async function GET() {
  if (!isStudyOwner(await getServerUserId())) {
    return NextResponse.json({ error: { code: "OWNER_ONLY", message: "Only the study's owner can see this." } }, { status: 403 });
  }
  const outcome = await studyOverview();
  if (!outcome.ok) {
    const { status, body } = problemResponse(outcome.problem, outcome.detail);
    return NextResponse.json(body, { status });
  }
  return NextResponse.json(outcome.value, { headers: { "cache-control": "no-store" } });
}
