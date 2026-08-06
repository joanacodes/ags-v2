/** GET /api/feedback/summary — feedback counts per chart (owner-scoped). */
import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = createSupabaseServerClient();
  if (supabase === null) return NextResponse.json({ counts: {} });
  const { data } = await supabase.from("reading_feedback").select("chart_id");
  const counts: Record<string, number> = {};
  for (const row of data ?? []) {
    counts[row.chart_id] = (counts[row.chart_id] ?? 0) + 1;
  }
  return NextResponse.json({ counts });
}
