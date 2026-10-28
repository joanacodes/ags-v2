import { HttpError, route } from "@/studio/server/api";
import { LIBRARY_TABS, libraryView, type LibraryTab } from "@/studio/views/library";

export const dynamic = "force-dynamic";

export const GET = route(async ({ ctx, url }) => {
  const p = url.searchParams;
  const tab = (p.get("tab") ?? "week") as LibraryTab;
  if (!(LIBRARY_TABS as readonly string[]).includes(tab)) throw new HttpError(400, "no such tab");
  return libraryView(ctx, {
    tab,
    week: p.get("week"),
    pillar: p.get("pillar"),
    language: p.get("language"),
    status: p.get("status"),
    platform: p.get("platform"),
    format: p.get("format"),
    q: p.get("q"),
    agent: p.get("agent"),
    outcome: p.get("outcome"),
    month: p.get("month"),
    failed: p.get("failed") === "1",
  });
});
