/**
 * GET  /api/charts/:chartId/forecast/marks — the look-back marks for this chart.
 * POST /api/charts/:chartId/forecast/marks — { key, verdict: "yes" | "no" | null, label, technique, score }:
 * sets a mark (null clears it). Each answer says whether the marks are saved or kept in memory only.
 */
import { NextResponse } from "next/server";
import { requireSignedIn } from "@/lib/supabase/server";
import { ForecastMarksStore } from "@/server/forecast-marks-store";

export async function GET(_request: Request, { params }: { params: { chartId: string } }) {
  const denied = await requireSignedIn();
  if (denied) return denied;
  return NextResponse.json(await ForecastMarksStore.list(params.chartId));
}

export async function POST(request: Request, { params }: { params: { chartId: string } }) {
  const denied = await requireSignedIn();
  if (denied) return denied;
  const body = (await request.json().catch(() => null)) as { key?: unknown; verdict?: unknown; label?: unknown; technique?: unknown; score?: unknown } | null;
  const verdict = body?.verdict === "yes" || body?.verdict === "no" ? body.verdict : body?.verdict === null ? null : undefined;
  if (!body || typeof body.key !== "string" || body.key.length > 300 || verdict === undefined) {
    return NextResponse.json({ error: { code: "BAD_REQUEST", message: "Give the period's key and a verdict: yes, no, or null to clear it." } }, { status: 400 });
  }
  return NextResponse.json(
    await ForecastMarksStore.set(params.chartId, {
      key: body.key,
      verdict,
      label: typeof body.label === "string" ? body.label.slice(0, 200) : "",
      technique: typeof body.technique === "string" ? body.technique.slice(0, 40) : "",
      score: typeof body.score === "number" && Number.isFinite(body.score) ? body.score : 0,
    }),
  );
}
