/**
 * GET /api/charts/:chartId/temporal[?refresh=1]
 * Assembles the temporal picture: Saturn return, solar returns for the next
 * 6 years from today, and current secondary progressions. Raw provider
 * payloads are cached with the chart (reserved slug `_temporal`, 7 days)
 * so the three upstream calls run rarely. Errors are surfaced verbatim.
 */
import { NextResponse } from "next/server";
import { ChartsStore } from "@/server/charts-store";
import { createCoreKnowledgeRegistry } from "@/knowledge/pack-loader";
import {
  fetchProgressions,
  fetchSaturnReturn,
  fetchSolarReturn,
} from "@/server/providers/freeastro-temporal";
import { createSupabaseServerClient, getServerUserId } from "@/lib/supabase/server";

const SLUG = "_temporal";
const TTL_MS = 7 * 24 * 3600 * 1000;

function definitionOf(key: string): string {
  const registry = createCoreKnowledgeRegistry();
  const resolution = registry.resolve(key);
  if (resolution.status !== "resolved") return "";
  const identity = resolution.record.modules.identity as { canonicalFunction?: string } | undefined;
  return identity?.canonicalFunction ?? "";
}

interface TemporalPayload {
  generatedAt: string;
  grounding?: { saturnReturn: string; solarReturn: string; progressions: string };
  saturnReturn: { ok: boolean; data?: unknown; error?: string };
  solarReturns: { year: number; ok: boolean; data?: unknown; error?: string }[];
  progressions: { ok: boolean; data?: unknown; error?: string };
}

async function readCache(chartId: string): Promise<TemporalPayload | null> {
  const supabase = createSupabaseServerClient();
  if (supabase === null) return null;
  const { data } = await supabase
    .from("readings")
    .select("reading")
    .eq("chart_id", chartId)
    .eq("slug", SLUG)
    .maybeSingle();
  return (data?.reading as TemporalPayload | undefined) ?? null;
}

async function writeCache(chartId: string, payload: TemporalPayload): Promise<void> {
  const supabase = createSupabaseServerClient();
  const userId = await getServerUserId();
  if (supabase === null || userId === null) return;
  await supabase.from("readings").upsert(
    {
      chart_id: chartId,
      user_id: userId,
      slug: SLUG,
      reading: payload,
      engine_version: "temporal-1.0",
      updated_at: new Date().toISOString(),
    },
    { onConflict: "chart_id,slug" },
  );
}

export async function GET(
  request: Request,
  { params }: { params: { chartId: string } },
) {
  try {
    const chart = await ChartsStore.getChart(params.chartId);
    if (chart.planets.length === 0) {
      return NextResponse.json(
        { error: { code: "NOT_CALCULATED", message: "Calculate the chart first." } },
        { status: 409 },
      );
    }
    const refresh = new URL(request.url).searchParams.get("refresh") === "1";
    if (!refresh) {
      const cached = await readCache(chart.id);
      if (
        cached !== null &&
        Date.now() - new Date(cached.generatedAt).getTime() < TTL_MS
      ) {
        return NextResponse.json(cached);
      }
    }

    const today = new Date();
    const isoToday = today.toISOString().slice(0, 10);
    const startYear = today.getUTCFullYear();
    const years = Array.from({ length: 6 }, (_, i) => startYear + i);

    const [saturn, progressions, ...solars] = await Promise.all([
      fetchSaturnReturn(chart),
      fetchProgressions(chart, isoToday),
      ...years.map((year) => fetchSolarReturn(chart, year)),
    ]);

    const payload: TemporalPayload = {
      generatedAt: new Date().toISOString(),
      grounding: {
        saturnReturn: definitionOf("techniques/saturn_return"),
        solarReturn: definitionOf("techniques/solar_return"),
        progressions: definitionOf("techniques/secondary_progressions"),
      },
      saturnReturn: saturn,
      progressions,
      solarReturns: years.map((year, index) => ({ year, ...solars[index] })),
    };
    await writeCache(chart.id, payload);
    return NextResponse.json(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const status = message.includes("not found") ? 404 : 500;
    return NextResponse.json(
      { error: { code: "TEMPORAL_FAILED", message } },
      { status },
    );
  }
}
