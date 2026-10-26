/**
 * POST /api/study/start — someone starts the Astro Study test (TASK-0013). Public: no account.
 * Builds their chart in the owner's library and their quiz, and returns the test's id.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { problemResponse, startTest } from "@/server/study-flow";

export const maxDuration = 120;

const Body = z.object({
  name: z.string().trim().min(1).max(80),
  email: z.string().trim().email().max(254),
  birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  birthTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable(),
  place: z.object({
    label: z.string().trim().min(1).max(160),
    country: z.string().trim().max(80),
    timezone: z.string().trim().min(1).max(64),
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
  }),
  length: z.enum(["short", "medium", "long"]),
  language: z.enum(["en", "fr"]),
  consent: z.literal(true),
  news: z.boolean(),
  source: z.string().trim().max(200).nullable().optional(),
  // A field people never see: anything in it means a robot filled the form.
  website: z.string().max(0).optional(),
});

export async function POST(request: Request) {
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "INVALID_INPUT", message: "Some details are missing or not valid." } },
      { status: 400 },
    );
  }
  const input = parsed.data;
  const outcome = await startTest({
    name: input.name,
    email: input.email,
    birthDate: input.birthDate,
    birthTime: input.birthTime,
    place: input.place,
    length: input.length,
    language: input.language,
    news: input.news,
    source: input.source ?? null,
  });
  if (!outcome.ok) {
    const { status, body } = problemResponse(outcome.problem, outcome.detail);
    return NextResponse.json(body, { status });
  }
  return NextResponse.json({ sessionId: outcome.value.sessionId });
}
