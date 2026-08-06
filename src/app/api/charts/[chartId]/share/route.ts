/**
 * POST /api/charts/:chartId/share {password} — create a readee link
 * GET  /api/charts/:chartId/share            — list the owner's links
 * Requires Supabase + a signed-in owner (links must outlive the session).
 */
import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST(
  request: Request,
  { params }: { params: { chartId: string } },
) {
  const supabase = createSupabaseServerClient();
  if (supabase === null) {
    return NextResponse.json(
      { error: { code: "NOT_CONFIGURED", message: "Supabase is not configured." } },
      { status: 503 },
    );
  }
  const body = (await request.json().catch(() => ({}))) as { password?: string };
  const password = (body.password ?? "").trim();
  if (password.length < 4) {
    return NextResponse.json(
      { error: { code: "WEAK_PASSWORD", message: "Password needs at least 4 characters." } },
      { status: 400 },
    );
  }
  const { data, error } = await supabase.rpc("create_share_link", {
    p_chart_id: params.chartId,
    p_password: password,
  });
  if (error !== null) {
    return NextResponse.json(
      { error: { code: "SHARE_FAILED", message: error.message } },
      { status: 500 },
    );
  }
  const result = data as { status: string; token?: string };
  if (result.status === "unauthenticated") {
    return NextResponse.json(
      { error: { code: "SIGN_IN_REQUIRED", message: "Sign in to create readee links." } },
      { status: 401 },
    );
  }
  if (result.status === "not_owner") {
    return NextResponse.json(
      { error: { code: "NOT_OWNER", message: "Only the chart owner can share it (demo charts cannot be shared)." } },
      { status: 403 },
    );
  }
  if (result.status !== "ok" || result.token === undefined) {
    return NextResponse.json(
      { error: { code: "SHARE_FAILED", message: `Could not create the link (${result.status}).` } },
      { status: 400 },
    );
  }
  return NextResponse.json({ token: result.token }, { status: 201 });
}

export async function GET(
  _request: Request,
  { params }: { params: { chartId: string } },
) {
  const supabase = createSupabaseServerClient();
  if (supabase === null) return NextResponse.json({ links: [] });
  const { data } = await supabase
    .from("share_links")
    .select("token, created_at, revoked")
    .eq("chart_id", params.chartId)
    .eq("revoked", false)
    .order("created_at", { ascending: false });
  return NextResponse.json({ links: data ?? [] });
}
