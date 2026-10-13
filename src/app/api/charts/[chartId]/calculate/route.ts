/**
 * POST /api/charts/:chartId/calculate
 * (Re)runs the FreeAstroAPI calculation for a pending or failed chart.
 */
import { NextResponse } from "next/server";
import { requireSignedIn } from "@/lib/supabase/server";
import { ChartsStore } from "@/server/charts-store";

export async function POST(
  _request: Request,
  { params }: { params: { chartId: string } },
) {
  const denied = await requireSignedIn();
  if (denied !== null) return denied;
  try {
    const outcome = await ChartsStore.recalculateChart(params.chartId);
    if (outcome.status === "ok") return NextResponse.json(outcome.chart);
    if (outcome.status === "demo") {
      return NextResponse.json(
        { error: { code: "DEMO_CHART", message: "Demo charts are fixed sample data." } },
        { status: 400 },
      );
    }
    if (outcome.status === "not_configured") {
      return NextResponse.json(
        {
          error: {
            code: "PROVIDER_NOT_CONFIGURED",
            message:
              "No FREE_ASTRO_API_KEY configured on the server. Add it to .env.local to enable real calculations.",
          },
        },
        { status: 503 },
      );
    }
    return NextResponse.json(
      { error: { code: "PROVIDER_FAILED", message: outcome.message } },
      { status: 502 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const status = message.includes("not found") ? 404 : 500;
    return NextResponse.json(
      { error: { code: status === 404 ? "CHART_NOT_FOUND" : "CALC_FAILED", message } },
      { status },
    );
  }
}
