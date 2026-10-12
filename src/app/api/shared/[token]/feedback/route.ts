/** POST /api/shared/:token/feedback — readee submits a rating and/or note. */
import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { canonicalPassword } from "@/sharing/readee";

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
  const body = (await request.json().catch(() => ({}))) as {
    password?: string;
    slug?: string;
    rating?: number;
    comment?: string;
    author?: string;
    quote?: string;
  };
  if (typeof body.slug !== "string" || body.slug.length === 0) {
    return NextResponse.json(
      { error: { code: "VALIDATION_FAILED", message: "Missing reading slug." } },
      { status: 400 },
    );
  }
  const rating =
    typeof body.rating === "number" && body.rating >= 1 && body.rating <= 5
      ? Math.round(body.rating)
      : null;
  const { data, error } = await supabase.rpc("submit_reading_feedback", {
    p_token: params.token,
    p_password: canonicalPassword(body.password ?? ""),
    p_slug: body.slug,
    p_rating: rating,
    p_comment: body.comment ?? "",
    p_author: body.author ?? "",
    p_quote: typeof body.quote === "string" ? body.quote.slice(0, 500) : "",
  });
  if (error !== null) {
    return NextResponse.json(
      { error: { code: "FEEDBACK_FAILED", message: error.message } },
      { status: 500 },
    );
  }
  const result = data as { status: string };
  if (result.status === "wrong_password" || result.status === "not_found") {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "This link is no longer valid." } },
      { status: 401 },
    );
  }
  if (result.status === "empty") {
    return NextResponse.json(
      { error: { code: "EMPTY", message: "Add a rating or a note before sending." } },
      { status: 400 },
    );
  }
  return NextResponse.json({ ok: true }, { status: 201 });
}
