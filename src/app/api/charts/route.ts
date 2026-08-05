/**
 * GET  /api/charts        — library list (user charts + session + demos)
 * POST /api/charts        — create a chart from the wizard draft
 * GET  /api/charts?stats=1 — library stats
 */
import { NextResponse } from "next/server";
import { ChartsStore } from "@/server/charts-store";

export async function GET(request: Request) {
  const url = new URL(request.url);
  try {
    if (url.searchParams.get("stats") === "1") {
      return NextResponse.json(await ChartsStore.getLibraryStats());
    }
    return NextResponse.json(await ChartsStore.listCharts());
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: { code: "CHARTS_FAILED", message } }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const draft = await request.json();
    for (const key of ["personal", "dateTime", "location", "configuration"]) {
      if (typeof draft?.[key] !== "object" || draft[key] === null) {
        return NextResponse.json(
          { error: { code: "VALIDATION_FAILED", message: `Missing draft section "${key}".` } },
          { status: 400 },
        );
      }
    }
    const result = await ChartsStore.createChart(draft);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: { code: "CREATE_FAILED", message } }, { status: 500 });
  }
}
