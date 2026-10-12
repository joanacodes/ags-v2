/**
 * POST /api/charts/:chartId/interpretation/ai
 * Recomputes the deterministic pipeline server-side, then asks the AI to
 * write prose grounded exclusively in the composed sentences.
 * The Anthropic API key never leaves the server.
 */
import { NextResponse } from "next/server";
import { ChartsStore } from "@/server/charts-store";
import { generateAiInterpretation } from "@/interpretation/ai";
import { resolveAiModel } from "@/interpretation/ai-models";
import { runInterpretationPipeline } from "@/interpretation/pipeline";
import { AiInterpretationStore } from "@/server/readings-store";

export async function POST(
  _request: Request,
  { params }: { params: { chartId: string } },
) {
  try {
    const chart = await ChartsStore.getChart(params.chartId);
    const pipeline = await runInterpretationPipeline(chart);
    const person = `${chart.person.firstName} ${chart.person.lastName}`.trim();
    const outcome = await generateAiInterpretation(
      pipeline,
      person,
      resolveAiModel(chart.configuration.aiModel),
    );
    if (outcome.status === "ok") {
      const saved = {
        text: outcome.text,
        model: outcome.model,
        generatedAt: new Date().toISOString(),
      };
      await AiInterpretationStore.save(chart.id, saved);
      return NextResponse.json(saved);
    }
    if (outcome.status === "no_api_key") {
      return NextResponse.json(
        {
          error: {
            code: "AI_NOT_CONFIGURED",
            message:
              "No ANTHROPIC_API_KEY configured on the server. Add it to .env.local to enable AI interpretation.",
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
    const status = message.toLowerCase().includes("not found") ? 404 : 500;
    return NextResponse.json(
      { error: { code: status === 404 ? "CHART_NOT_FOUND" : "PIPELINE_FAILED", message } },
      { status },
    );
  }
}
