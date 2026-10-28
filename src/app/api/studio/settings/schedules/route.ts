import { route } from "@/studio/server/api";
import { describeCron, nextRun, parseCron } from "@/studio/schedule/cron";
import { slotsFor } from "@/studio/kit/load";
import { PLATFORMS, PLATFORM_LABELS } from "@/studio/types";

export const dynamic = "force-dynamic";

/** Every schedule in one table with its Paris reading and next run, and every platform's slots. */
export const GET = route(async ({ ctx }) => {
  const s = ctx.settings;
  const rows: { node: string; field: string; label: string; cron: string; enabled: boolean }[] = [
    { node: "strategist", field: "schedule", label: "Strategist and writers", cron: s.get("strategist").schedule, enabled: s.get("strategist").enabled },
    { node: "community", field: "schedule", label: "Community", cron: s.get("community").schedule, enabled: s.get("community").enabled },
    { node: "analyst", field: "schedule", label: "Analyst", cron: s.get("analyst").schedule, enabled: s.get("analyst").enabled },
    { node: "input-metrics", field: "schedule", label: "Metrics", cron: s.get("input-metrics").schedule, enabled: s.get("input-metrics").enabled },
    { node: "render-video", field: "schedule", label: "Render (pictures and videos)", cron: s.get("render-video").schedule, enabled: s.get("render-video").enabled },
    { node: "input-site", field: "schedule", label: "Site pages", cron: s.get("input-site").schedule, enabled: s.get("input-site").enabled },
    { node: "input-site", field: "sky_schedule", label: "Sky table", cron: s.get("input-site").sky_schedule, enabled: s.get("input-site").enabled },
    { node: "maintenance", field: "schedule", label: "Maintenance", cron: s.get("maintenance").schedule, enabled: true },
  ];
  return {
    paused: s.get("global").paused,
    schedules: rows.map((r) => {
      let next: string | null = null;
      try {
        next = nextRun(parseCron(r.cron), ctx.now)?.toISOString() ?? null;
      } catch {
        next = null;
      }
      return { ...r, reading: describeCron(r.cron), next };
    }),
    outbox: s.get("outbox"),
    platforms: PLATFORMS.map((p) => {
      const conf = s.platform(p);
      const formats = ctx.kit.platforms[p]?.formats ?? [];
      return { id: p, label: PLATFORM_LABELS[p], enabled: conf.enabled, mode: s.postingMode(p), slots: conf.slots, maxPerDay: conf.max_per_day, kitSlots: formats.flatMap((f) => slotsFor(ctx.kit, p, f)).filter((v, i, a) => a.indexOf(v) === i).sort() };
    }),
  };
});
