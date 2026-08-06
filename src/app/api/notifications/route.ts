/**
 * GET /api/notifications — the astrologer's recent readee activity
 * (new ratings and comments across all their charts). RLS scopes rows
 * to the signed-in owner automatically.
 */
import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = createSupabaseServerClient();
  if (supabase === null) return NextResponse.json({ items: [] });
  const { data: rows } = await supabase
    .from("reading_feedback")
    .select("id, chart_id, slug, rating, comment, author, quote, created_at")
    .order("created_at", { ascending: false })
    .limit(25);
  if (rows === null || rows.length === 0) return NextResponse.json({ items: [] });
  const chartIds = [...new Set(rows.map((r) => r.chart_id))];
  const { data: charts } = await supabase
    .from("charts")
    .select("id, first_name, last_name")
    .in("id", chartIds);
  const names = new Map((charts ?? []).map((c) => [c.id, `${c.first_name} ${c.last_name}`]));
  return NextResponse.json({
    items: rows.map((r) => ({ ...r, chartName: names.get(r.chart_id) ?? "a chart" })),
  });
}
