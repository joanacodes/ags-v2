/**
 * POST /api/charts/:chartId/readings/:slug/generate
 * Runs the domain pipeline (grammar filter -> sentences -> teaching AI),
 * persists the reading, returns it. Demo chart readings are fixed samples.
 */
import { NextResponse } from "next/server";
import { requireSignedIn } from "@/lib/supabase/server";
import { ChartsStore } from "@/server/charts-store";
import { ReadingsStore } from "@/server/readings-store";
import { generateDomainReading } from "@/interpretation/reading-pipeline";
import { allowFallbackFrom } from "@/interpretation/ai-models";
import { PromptsStore } from "@/server/prompts-store";

export async function POST(
  request: Request,
  { params }: { params: { chartId: string; slug: string } },
) {
  const denied = await requireSignedIn();
  if (denied !== null) return denied;
  try {
    const body = (await request.json().catch(() => ({}))) as { style?: string; language?: string };
    const style = ["clinical", "poetic", "conversational"].includes(body.style ?? "")
      ? (body.style as string)
      : "conversational";
    const language = ["en", "fr", "es", "pt", "de", "it"].includes(body.language ?? "")
      ? (body.language as string)
      : "en";
    const chart = await ChartsStore.getChart(params.chartId);
    const outcome = await generateDomainReading(chart, params.slug, style, language, {
      prompts: await PromptsStore.getPrompts(),
      allowFallback: allowFallbackFrom(request),
    });
    if (outcome.status === "ok") {
      await ReadingsStore.saveReading(chart, outcome.reading);
      return NextResponse.json(outcome.reading);
    }
    if (outcome.status === "no_placements") {
      return NextResponse.json(
        {
          error: {
            code: "CHART_NOT_CALCULATED",
            message: "Calculate the chart first — readings are built from real placements.",
          },
        },
        { status: 409 },
      );
    }
    if (outcome.status === "refused") {
      return NextResponse.json(
        { error: { code: "AI_REFUSED", message: outcome.message } },
        { status: 422 },
      );
    }
    if (outcome.status === "no_api_key") {
      return NextResponse.json(
        {
          error: {
            code: "AI_NOT_CONFIGURED",
            message:
              "No ANTHROPIC_API_KEY configured on the server. Add it to .env.local to generate readings.",
          },
        },
        { status: 503 },
      );
    }
    return NextResponse.json(
      { error: { code: "AI_PROVIDER_ERROR", message: outcome.message } },
      { status: 502 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const status = message.includes("not found") ? 404 : 500;
    return NextResponse.json(
      { error: { code: status === 404 ? "CHART_NOT_FOUND" : "GENERATE_FAILED", message } },
      { status },
    );
  }
}
