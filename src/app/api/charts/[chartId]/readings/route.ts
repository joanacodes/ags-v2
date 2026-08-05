/**
 * GET /api/charts/:chartId/readings — all domains (generated + scaffolds)
 * GET /api/charts/:chartId/readings?progress=1 — completion summary
 */
import { NextResponse } from "next/server";
import { ChartsStore } from "@/server/charts-store";
import { ReadingsStore } from "@/server/readings-store";

export async function GET(
  request: Request,
  { params }: { params: { chartId: string } },
) {
  try {
    const chart = await ChartsStore.getChart(params.chartId);
    const url = new URL(request.url);
    if (url.searchParams.get("progress") === "1") {
      return NextResponse.json(await ReadingsStore.getProgress(chart));
    }
    return NextResponse.json(await ReadingsStore.listReadings(chart));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const status = message.includes("not found") ? 404 : 500;
    return NextResponse.json(
      { error: { code: status === 404 ? "CHART_NOT_FOUND" : "READINGS_FAILED", message } },
      { status },
    );
  }
}
