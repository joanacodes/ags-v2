import { route } from "@/studio/server/api";

export const dynamic = "force-dynamic";

/** Every state change and outbox call, newest first, with the runs of the same period. */
export const GET = route(async ({ ctx, url }) => {
  const days = Math.min(90, Math.max(1, Number(url.searchParams.get("days") ?? 7) || 7));
  const since = new Date(ctx.now.getTime() - days * 86400_000).toISOString();
  const table = url.searchParams.get("table") || undefined;
  const [events, runs] = await Promise.all([ctx.store.events({ table, since, limit: 2000 }), ctx.store.runs({ since, limit: 2000 })]);
  return { events: [...events].sort((a, b) => b.at.localeCompare(a.at)), runs: runs.filter((r) => r.agent !== "tick") };
});
