/**
 * POST /api/shared/:token {password} — readee unlocks the shared readings.
 * Anonymous by design: validation happens in the security-definer function.
 */
import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST(
  request: Request,
  { params }: { params: { token: string } },
) {
  const supabase = createSupabaseServerClient();
  if (supabase === null) {
    return NextResponse.json(
      { error: { code: "NOT_CONFIGURED", message: "Sharing is not available." } },
      { status: 503 },
    );
  }
  const body = (await request.json().catch(() => ({}))) as { password?: string };
  const { data, error } = await supabase.rpc("get_shared_readings", {
    p_token: params.token,
    p_password: body.password ?? "",
  });
  if (error !== null) {
    return NextResponse.json(
      { error: { code: "SHARED_FAILED", message: error.message } },
      { status: 500 },
    );
  }
  const result = data as { status: string; person?: string; chart?: unknown; readings?: unknown[] };
  if (result.status === "not_found") {
    return NextResponse.json(
      { error: { code: "LINK_NOT_FOUND", message: "This link does not exist or was revoked." } },
      { status: 404 },
    );
  }
  if (result.status === "wrong_password") {
    return NextResponse.json(
      { error: { code: "WRONG_PASSWORD", message: "Incorrect password." } },
      { status: 401 },
    );
  }
  return NextResponse.json({ person: result.person ?? "", chart: result.chart ?? null, readings: result.readings ?? [] });
}
