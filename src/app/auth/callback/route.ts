/**
 * Auth callback: exchanges the email-confirmation / recovery code for a
 * session, then forwards to the requested page.
 */
import { NextResponse } from "next/server";
import { safeNextPath } from "@/lib/auth-paths";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const safeNext = safeNextPath(url.searchParams.get("next"), "/dashboard");
  const supabase = createSupabaseServerClient();
  if (supabase !== null && code !== null) {
    await supabase.auth.exchangeCodeForSession(code);
  }
  return NextResponse.redirect(new URL(safeNext, url.origin));
}
