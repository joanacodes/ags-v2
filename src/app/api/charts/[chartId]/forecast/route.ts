/**
 * POST /api/charts/:chartId/forecast — the forecast for a stretch of time (TASK-0015).
 * Body: { mode: "back" | "ahead", from: ISO date, to: ISO date, solarReturnAt?: { latitude, longitude, label },
 * releasingYear?: "valens" | "calendar" }. A chart without a birth time is refused (422): there is no reading without one.
 * Computed on the server: the positions come from astronomy-engine and the words from AGS's definition library,
 * which never goes to the browser. Nothing is stored; the look-back marks have their own route.
 */
import { NextResponse } from "next/server";
import { ChartsStore } from "@/server/charts-store";
import { requireSignedIn } from "@/lib/supabase/server";
import { buildForecast } from "@/forecast";

export const maxDuration = 60;

function error(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message } }, { status });
}

export async function POST(request: Request, { params }: { params: { chartId: string } }) {
  const denied = await requireSignedIn();
  if (denied) return denied;
  let body: { mode?: unknown; from?: unknown; to?: unknown; solarReturnAt?: unknown; releasingYear?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return error("BAD_REQUEST", "The request body must be JSON.", 400);
  }
  const mode = body.mode === "back" ? "back" : body.mode === "ahead" ? "ahead" : null;
  if (mode === null || typeof body.from !== "string" || typeof body.to !== "string") {
    return error("BAD_REQUEST", "Give a mode (back or ahead) and the dates from and to.", 400);
  }
  const releasingYear = body.releasingYear === undefined || body.releasingYear === "valens" ? "valens" : body.releasingYear === "calendar" ? "calendar" : null;
  if (releasingYear === null) return error("BAD_REQUEST", "releasingYear is valens (360-day years) or calendar.", 400);
  let solarReturnAt: { latitude: number; longitude: number; label: string } | null = null;
  const place = body.solarReturnAt as { latitude?: unknown; longitude?: unknown; label?: unknown } | null | undefined;
  if (place) {
    const latitude = Number(place.latitude);
    const longitude = Number(place.longitude);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
      return error("BAD_REQUEST", "The solar return's place needs a latitude between -90 and 90 and a longitude between -180 and 180.", 400);
    }
    solarReturnAt = { latitude, longitude, label: typeof place.label === "string" && place.label.trim() ? place.label.trim() : `${latitude}, ${longitude}` };
  }
  try {
    const chart = await ChartsStore.getChart(params.chartId);
    return NextResponse.json(buildForecast(chart, { mode, from: body.from, to: body.to, solarReturnAt, releasingYear }));
  } catch (e) {
    return error("FORECAST_FAILED", e instanceof Error ? e.message : "The forecast could not be computed.", 422);
  }
}
