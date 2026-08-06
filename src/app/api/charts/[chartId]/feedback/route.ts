/** GET /api/charts/:chartId/feedback[?slug=] — owner reads readee feedback. */
import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(
  request: Request,
  { params }: { params: { chartId: string } },
) {
  const supabase = createSupabaseServerClient();
  if (supabase === null) return NextResponse.json({ feedback: [] });
  const slug = new URL(request.url).searchParams.get("slug");
  let query = supabase
    .from("reading_feedback")
    .select("id, slug, rating, comment, author, created_at")
    .eq("chart_id", params.chartId)
    .order("created_at", { ascending: false });
  if (slug !== null && slug !== "") query = query.eq("slug", slug);
  const { data } = await query;
  return NextResponse.json({ feedback: data ?? [] });
}
