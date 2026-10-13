/**
 * POST /api/shared/:token {password} — readee unlocks the shared readings.
 * Anonymous by design: validation happens in the security-definer function.
 */
import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { passwordCandidates, toReadeeChart, toReadeeReading } from "@/sharing/readee";
import { isSynastrySlug } from "@/interpretation/synastry";
import { reportOrder } from "@/interpretation/domains";
import type { Chart, Reading } from "@/types";

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
  // Birth date as DDMMYYYY, then older password formats (see passwordCandidates).
  let result: { status: string; person?: string; chart?: Chart | null; readings?: Reading[] } = {
    status: "wrong_password",
  };
  for (const candidate of passwordCandidates(body.password ?? "")) {
    const { data, error } = await supabase.rpc("get_shared_readings", {
      p_token: params.token,
      p_password: candidate,
    });
    if (error !== null) {
      return NextResponse.json(
        { error: { code: "SHARED_FAILED", message: error.message } },
        { status: 500 },
      );
    }
    result = data as typeof result;
    if (result.status !== "wrong_password") break;
  }
  if (result.status === "not_found") {
    return NextResponse.json(
      { error: { code: "LINK_NOT_FOUND", message: "This link does not exist or was revoked." } },
      { status: 404 },
    );
  }
  if (result.status === "wrong_password") {
    return NextResponse.json(
      { error: { code: "WRONG_PASSWORD", message: "That date of birth doesn’t match. Type it as 8 digits, day first: DDMMYYYY." } },
      { status: 401 },
    );
  }
  // Only what the readee should see: no model, settings or astrologer notes.
  return NextResponse.json({
    person: result.person ?? "",
    chart: result.chart != null ? toReadeeChart(result.chart) : null,
    // Synastry readings involve someone else's chart: never shown to a readee
    // (the database already leaves out private "_" records; this is a backstop).
    // In the astrologer's report order (the database sorts them by name).
    readings: (result.readings ?? [])
      .filter((r) => !isSynastrySlug(r.slug))
      .sort((a, b) => reportOrder(a.slug) - reportOrder(b.slug))
      .map(toReadeeReading),
  });
}
