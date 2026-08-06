/** GET/POST astrologer notes attached to one reading. */
import { NextResponse } from "next/server";
import { NotesStore } from "@/server/readings-store";

export async function GET(
  _request: Request,
  { params }: { params: { chartId: string; slug: string } },
) {
  return NextResponse.json({ notes: await NotesStore.list(params.chartId, params.slug) });
}

export async function POST(
  request: Request,
  { params }: { params: { chartId: string; slug: string } },
) {
  const body = (await request.json().catch(() => ({}))) as { text?: string };
  const text = (body.text ?? "").trim();
  if (text.length === 0 || text.length > 4000) {
    return NextResponse.json(
      { error: { code: "VALIDATION_FAILED", message: "Note text is required (max 4000 chars)." } },
      { status: 400 },
    );
  }
  const notes = await NotesStore.add(params.chartId, params.slug, text);
  return NextResponse.json({ notes }, { status: 201 });
}
