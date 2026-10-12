/**
 * GET   /api/charts/:chartId — one chart (db, session, or demo)
 * PATCH /api/charts/:chartId — toggle favourite, set status, set AI model
 */
import { NextResponse } from "next/server";
import { ChartsStore } from "@/server/charts-store";
import { isAiModelId } from "@/interpretation/ai-models";

export async function GET(
  _request: Request,
  { params }: { params: { chartId: string } },
) {
  try {
    return NextResponse.json(await ChartsStore.getChart(params.chartId));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: { code: "CHART_NOT_FOUND", message } },
      { status: 404 },
    );
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: { chartId: string } },
) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      action?: string;
      status?: string;
      aiModel?: unknown;
    };
    if (body.action === "set-ai-model") {
      if (!isAiModelId(body.aiModel)) {
        return NextResponse.json(
          { error: { code: "VALIDATION_FAILED", message: "Unknown AI model." } },
          { status: 400 },
        );
      }
      return NextResponse.json(await ChartsStore.setAiModel(params.chartId, body.aiModel));
    }
    if (body.action === "set-status") {
      const status = body.status === "archived" ? "archived" : "active";
      return NextResponse.json(await ChartsStore.setStatus(params.chartId, status));
    }
    if (body.action !== "toggle-favourite") {
      return NextResponse.json(
        { error: { code: "VALIDATION_FAILED", message: "Unsupported PATCH action." } },
        { status: 400 },
      );
    }
    return NextResponse.json(await ChartsStore.toggleFavourite(params.chartId));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const status = message.includes("not found") ? 404 : message.includes("Demo") ? 400 : 500;
    return NextResponse.json(
      { error: { code: status === 404 ? "CHART_NOT_FOUND" : "PATCH_FAILED", message } },
      { status },
    );
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: { chartId: string } },
) {
  try {
    await ChartsStore.deleteChart(params.chartId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const status = message.includes("not found") ? 404 : message.includes("Demo") ? 400 : 500;
    return NextResponse.json({ error: { code: "DELETE_FAILED", message } }, { status });
  }
}
