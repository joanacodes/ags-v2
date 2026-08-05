/** GET /api/sky — cached snapshot of the current planetary positions. */
import { NextResponse } from "next/server";
import { getCurrentSky } from "@/server/sky-store";

export async function GET() {
  const outcome = await getCurrentSky();
  if (outcome.status === "ok") return NextResponse.json(outcome.snapshot);
  if (outcome.status === "not_configured") {
    return NextResponse.json(
      { error: { code: "PROVIDER_NOT_CONFIGURED", message: "FREE_ASTRO_API_KEY is not set." } },
      { status: 503 },
    );
  }
  return NextResponse.json(
    { error: { code: "SKY_FAILED", message: outcome.message } },
    { status: 502 },
  );
}
