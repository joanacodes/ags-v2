/**
 * What the Studio needs in its tables before its first run, taken from the kit: the hook bank, the launch
 * calendar and the November–December sky. Idempotent: run before every strategist run, it adds only what
 * is missing and never overwrites what the owner changed.
 */
import type { AgentContext } from "./context";
import type { Language } from "../types";

export async function ensureSeeds(ctx: AgentContext): Promise<{ hooks: number; calendar: number; sky: number }> {
  const { store, kit } = ctx;
  const hooks = await store.addHooks(
    (["en", "fr"] as Language[]).flatMap((language) => kit.hooks[language].map((h) => ({ text: h.text, pillar: h.pillar, language, source: "kit" }))),
  );
  let calendar = 0;
  const firstCal = kit.calendar.map((c) => c.date).sort()[0];
  if (firstCal) {
    const existing = await store.calendar({ from: firstCal, to: "2100-01-01" });
    const missing = kit.calendar.filter((c) => !existing.some((e) => e.date === c.date && e.event === c.event));
    calendar = await store.upsertCalendar(missing.map((c) => ({ date: c.date, event: c.event, note: c.note ?? null, source: "launch plan", remind: true })));
  }
  let sky = 0;
  const firstSky = kit.sky.map((s) => s.date).sort()[0];
  if (firstSky) {
    const existing = await store.sky({ from: firstSky, to: "2100-01-01" });
    const missing = kit.sky.filter((s) => !existing.some((e) => e.date === s.date && e.event === s.event));
    sky = await store.upsertSky(
      missing.map((s) => ({
        date: s.date,
        time_paris: s.time ?? null,
        kind: s.kind,
        body: s.body,
        sign: s.sign ?? null,
        degree: null,
        event: s.event,
        source1: "the launch plan (checked against two sources)",
        source2: s.approx ? null : "the launch plan's second source",
        created_by: "kit",
      })),
    );
  }
  return { hooks, calendar, sky };
}
