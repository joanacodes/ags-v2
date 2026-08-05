/**
 * GET /api/charts/:chartId/report — live report (demo chart keeps its mock).
 */
import { NextResponse } from "next/server";
import reportJson from "@/data/sample-report.json";
import { ChartsStore } from "@/server/charts-store";
import { ReadingsStore, ReportEditsStore } from "@/server/readings-store";
import { buildReport } from "@/server/report-builder";
import type { Report } from "@/types";

const demoReport = reportJson.report as Report;

export async function GET(
  _request: Request,
  { params }: { params: { chartId: string } },
) {
  try {
    if (params.chartId === demoReport.chartId) {
      return NextResponse.json(demoReport);
    }
    const chart = await ChartsStore.getChart(params.chartId);
    const readings = await ReadingsStore.listReadings(chart);
    const edits = await ReportEditsStore.get(chart.id);
    return NextResponse.json(buildReport(chart, readings, edits));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const status = message.includes("not found") ? 404 : 500;
    return NextResponse.json(
      { error: { code: status === 404 ? "CHART_NOT_FOUND" : "REPORT_FAILED", message } },
      { status },
    );
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: { chartId: string } },
) {
  try {
    const body = (await request.json()) as { sectionId?: string; paragraphs?: string[] };
    if (
      typeof body.sectionId !== "string" ||
      !Array.isArray(body.paragraphs) ||
      body.paragraphs.some((p) => typeof p !== "string")
    ) {
      return NextResponse.json(
        { error: { code: "VALIDATION_FAILED", message: "sectionId and paragraphs[] required." } },
        { status: 400 },
      );
    }
    await ReportEditsStore.saveSection(params.chartId, body.sectionId, body.paragraphs);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: { code: "EDIT_FAILED", message } }, { status: 500 });
  }
}
