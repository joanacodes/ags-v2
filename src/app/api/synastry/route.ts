/**
 * GET /api/synastry — the signed-in user's synastries (newest first).
 */
import { NextResponse } from "next/server";
import { SynastryStore } from "@/server/synastry-store";

export const dynamic = "force-dynamic";

export async function GET() {
  const items = await SynastryStore.list();
  return NextResponse.json(
    items.map((r) => ({
      ownerChartId: r.ownerChartId,
      partnerChartId: r.partnerChartId,
      ownerName: r.ownerName,
      partnerName: r.partnerName,
      title: r.title,
      status: r.status,
    })),
  );
}
