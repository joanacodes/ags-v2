/**
 * GET  /api/charts        — library list (user charts + session + demos)
 * POST /api/charts        — create a chart from the wizard draft
 * GET  /api/charts?stats=1 — library stats
 * GET  /api/charts?progress=1 — readings written and being written, per chart
 */
import { NextResponse } from "next/server";
import { requireSignedIn } from "@/lib/supabase/server";
import { ChartsStore } from "@/server/charts-store";
import { ReadingsStore } from "@/server/readings-store";
import { GenerationJobs } from "@/server/generation-jobs";
import { READING_DOMAINS } from "@/interpretation/domains";
import { isAiModelId } from "@/interpretation/ai-models";
import type { ChartLibraryStats, ChartsReadingProgress } from "@/types";

export const dynamic = "force-dynamic";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** Counts from the person's own charts and readings (the samples aren't counted). */
async function libraryStats(): Promise<ChartLibraryStats> {
  const [own, completed, lastReadingAt] = await Promise.all([
    ChartsStore.listOwnCharts(),
    ReadingsStore.completedByChart(),
    ReadingsStore.lastWrittenAt(),
  ]);
  const weekAgo = Date.now() - WEEK_MS;
  return {
    total: own.length,
    favourited: own.filter((c) => c.favourite).length,
    active: own.filter((c) => c.status === "active").length,
    archived: own.filter((c) => c.status === "archived").length,
    addedThisWeek: own.filter((c) => Date.parse(c.createdAt) >= weekAgo).length,
    readingsWritten: own.reduce((sum, c) => sum + (completed[c.id] ?? 0), 0),
    chartsComplete: own.filter((c) => (completed[c.id] ?? 0) >= READING_DOMAINS.length).length,
    lastReadingAt,
  };
}

async function readingProgress(): Promise<ChartsReadingProgress> {
  const [completed, jobs] = await Promise.all([ReadingsStore.completedByChart(), GenerationJobs.summaryByChart()]);
  const charts: ChartsReadingProgress["charts"] = {};
  for (const chartId of new Set([...Object.keys(completed), ...Object.keys(jobs)])) {
    charts[chartId] = {
      complete: completed[chartId] ?? 0,
      queued: jobs[chartId]?.queued ?? 0,
      running: jobs[chartId]?.running ?? null,
      failed: jobs[chartId]?.failed ?? 0,
    };
  }
  return { total: READING_DOMAINS.length, charts };
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  try {
    if (url.searchParams.get("stats") === "1") {
      return NextResponse.json(await libraryStats());
    }
    if (url.searchParams.get("progress") === "1") {
      return NextResponse.json(await readingProgress());
    }
    return NextResponse.json(await ChartsStore.listCharts());
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: { code: "CHARTS_FAILED", message } }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const denied = await requireSignedIn();
  if (denied !== null) return denied;
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
    const aiModel: unknown = draft.configuration.aiModel;
    if (aiModel !== undefined && !isAiModelId(aiModel)) {
      return NextResponse.json(
        { error: { code: "VALIDATION_FAILED", message: `Unknown AI model "${String(aiModel)}".` } },
        { status: 400 },
      );
    }
    const result = await ChartsStore.createChart(draft);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: { code: "CREATE_FAILED", message } }, { status: 500 });
  }
}
