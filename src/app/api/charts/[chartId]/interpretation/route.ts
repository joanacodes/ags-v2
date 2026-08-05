/**
 * GET /api/charts/:chartId/interpretation
 * Runs the deterministic pipeline (grammar -> knowledge -> composed
 * sentences) server-side and returns the structured result.
 */
import { NextResponse } from "next/server";
import { ChartsStore } from "@/server/charts-store";
import { runInterpretationPipeline } from "@/interpretation/pipeline";
import { AiInterpretationStore } from "@/server/readings-store";

export async function GET(
  _request: Request,
  { params }: { params: { chartId: string } },
) {
  try {
    const chart = await ChartsStore.getChart(params.chartId);
    const result = await runInterpretationPipeline(chart);
    const savedAi = await AiInterpretationStore.get(chart.id);
    return NextResponse.json({ ...result, savedAi });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const status = message.toLowerCase().includes("not found") ? 404 : 500;
    return NextResponse.json(
      { error: { code: status === 404 ? "CHART_NOT_FOUND" : "PIPELINE_FAILED", message } },
      { status },
    );
  }
}
