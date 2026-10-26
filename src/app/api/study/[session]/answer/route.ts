/**
 * POST /api/study/:session/answer — one answer (public, by the test's unguessable id). The last one
 * closes the test and returns the result.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { answerQuestion, problemResponse, withLink } from "@/server/study-flow";

export const maxDuration = 60;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const Body = z.object({ position: z.number().int().min(0).max(30), answer: z.enum(["A", "B", "C"]) });

export async function POST(request: Request, { params }: { params: { session: string } }) {
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!UUID.test(params.session) || !parsed.success) {
    return NextResponse.json({ error: { code: "INVALID_INPUT", message: "That answer couldn't be read." } }, { status: 400 });
  }
  const outcome = await answerQuestion(params.session, parsed.data.position, parsed.data.answer);
  if (!outcome.ok) {
    const { status, body } = problemResponse(outcome.problem, outcome.detail);
    return NextResponse.json(body, { status });
  }
  return NextResponse.json(withLink(outcome.value, request), { headers: { "cache-control": "no-store" } });
}
