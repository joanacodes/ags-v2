/** GET /api/charts/:chartId/readings/:slug — one domain reading (or scaffold). */
import { NextResponse } from "next/server";
import { ChartsStore } from "@/server/charts-store";
import { ReadingsStore } from "@/server/readings-store";

export async function GET(
  _request: Request,
  { params }: { params: { chartId: string; slug: string } },
) {
  try {
    const chart = await ChartsStore.getChart(params.chartId);
    const reading = await ReadingsStore.getReading(chart, params.slug);
    if (reading === undefined) {
      return NextResponse.json(
        { error: { code: "READING_NOT_FOUND", message: `No domain "${params.slug}".` } },
        { status: 404 },
      );
    }
    return NextResponse.json(reading);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const status = message.includes("not found") ? 404 : 500;
    return NextResponse.json(
      { error: { code: status === 404 ? "CHART_NOT_FOUND" : "READING_FAILED", message } },
      { status },
    );
  }
}
