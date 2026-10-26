/**
 * GET    /api/study/:session — the test as its taker may see it (public, by its unguessable id).
 * DELETE /api/study/:session — the owner forgets a participant: chart, readings, link and test.
 */
import { NextResponse } from "next/server";
import { getServerUserId } from "@/lib/supabase/server";
import { deleteParticipant, getTest, isStudyOwner, problemResponse, withLink } from "@/server/study-flow";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request: Request, { params }: { params: { session: string } }) {
  if (!UUID.test(params.session)) {
    const { status, body } = problemResponse("not_found");
    return NextResponse.json(body, { status });
  }
  const outcome = await getTest(params.session);
  if (!outcome.ok) {
    const { status, body } = problemResponse(outcome.problem, outcome.detail);
    return NextResponse.json(body, { status });
  }
  return NextResponse.json(withLink(outcome.value, request), { headers: { "cache-control": "no-store" } });
}

export async function DELETE(_request: Request, { params }: { params: { session: string } }) {
  if (!isStudyOwner(await getServerUserId())) {
    return NextResponse.json({ error: { code: "OWNER_ONLY", message: "Only the study's owner can do this." } }, { status: 403 });
  }
  if (!UUID.test(params.session)) {
    const { status, body } = problemResponse("not_found");
    return NextResponse.json(body, { status });
  }
  const outcome = await deleteParticipant(params.session);
  if (!outcome.ok) {
    const { status, body } = problemResponse(outcome.problem, outcome.detail);
    return NextResponse.json(body, { status });
  }
  return NextResponse.json(outcome.value);
}
