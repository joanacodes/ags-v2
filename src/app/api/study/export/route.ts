/** GET /api/study/export — every answer of every finished test, as a CSV file (owner only). */
import { NextResponse } from "next/server";
import { getServerUserId } from "@/lib/supabase/server";
import { isStudyOwner, problemResponse, studyCsv } from "@/server/study-flow";

export async function GET() {
  if (!isStudyOwner(await getServerUserId())) {
    return NextResponse.json({ error: { code: "OWNER_ONLY", message: "Only the study's owner can download this." } }, { status: 403 });
  }
  const outcome = await studyCsv();
  if (!outcome.ok) {
    const { status, body } = problemResponse(outcome.problem, outcome.detail);
    return NextResponse.json(body, { status });
  }
  const day = new Date().toISOString().slice(0, 10);
  return new NextResponse(outcome.value, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="astro-study-${day}.csv"`,
      "cache-control": "no-store",
    },
  });
}
