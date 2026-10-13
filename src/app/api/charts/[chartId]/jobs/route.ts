/**
 * Background generation for one chart.
 *   GET    → { available, queued, running, failed }
 *   POST   { style, language } → queue every missing reading
 *   DELETE → stop (drop the readings not started yet)
 * 503 BACKGROUND_UNAVAILABLE when the server is not set up for it: the page
 * then falls back to generating in the browser.
 */
import { NextResponse } from "next/server";
import { requireSignedIn } from "@/lib/supabase/server";
import { BackgroundUnavailableError, GenerationJobs } from "@/server/generation-jobs";

export const dynamic = "force-dynamic";

const STYLES = ["clinical", "poetic", "conversational"];
const LANGUAGES = ["en", "fr", "es", "pt", "de", "it"];

export async function GET(_request: Request, { params }: { params: { chartId: string } }) {
  return NextResponse.json(await GenerationJobs.summary(params.chartId));
}

export async function POST(request: Request, { params }: { params: { chartId: string } }) {
  const denied = await requireSignedIn();
  if (denied !== null) return denied;
  const body = (await request.json().catch(() => ({}))) as { style?: string; language?: string };
  const style = STYLES.includes(body.style ?? "") ? (body.style as string) : "conversational";
  const language = LANGUAGES.includes(body.language ?? "") ? (body.language as string) : "en";
  try {
    const result = await GenerationJobs.enqueue(params.chartId, style, language);
    return NextResponse.json({ ...result, summary: await GenerationJobs.summary(params.chartId) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    if (error instanceof BackgroundUnavailableError) {
      return NextResponse.json({ error: { code: "BACKGROUND_UNAVAILABLE", message } }, { status: 503 });
    }
    const status = message.includes("not found") ? 404 : 500;
    return NextResponse.json({ error: { code: "ENQUEUE_FAILED", message } }, { status });
  }
}

export async function DELETE(_request: Request, { params }: { params: { chartId: string } }) {
  await GenerationJobs.cancel(params.chartId);
  return NextResponse.json(await GenerationJobs.summary(params.chartId));
}
