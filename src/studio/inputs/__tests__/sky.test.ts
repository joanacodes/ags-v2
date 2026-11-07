/** The sky scan against a made-up sky whose answers are known to the minute. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { MemoryStore, MemoryStorage } from "../../store/memory";
import { defaultKit } from "../../kit/load";
import { StudioSettings } from "../../settings";
import type { AgentContext } from "../../agents/context";
import { runSky, scanSamples, type BodyPosition, type Ephemeris } from "../sky";

const DAY = 86400_000;

/** Sun and Moon at constant speeds, Mercury slowing to a station on day 12. */
function synthetic(t0: Date, opts: { moonOffset?: number } = {}): Ephemeris {
  return async (at: Date) => {
    const d = (at.getTime() - t0.getTime()) / DAY;
    const sun = 225 + 0.9856 * d;
    const moon = 225 + (opts.moonOffset ?? 0) + 13.1764 * d;
    const mercurySpeed = 1.2 - 0.1 * d;
    const mercury = 230 + 1.2 * d - 0.05 * d * d;
    const out: BodyPosition[] = [
      { key: "sun", lon: ((sun % 360) + 360) % 360, speed: 0.9856 },
      { key: "moon", lon: ((moon % 360) + 360) % 360, speed: 13.1764 },
      { key: "mercury", lon: mercury, speed: mercurySpeed },
    ];
    return out;
  };
}

function ctx(store: MemoryStore, now: Date, days = 40): AgentContext {
  return { store, storage: new MemoryStorage(), transport: null, kit: defaultKit(), kitVersion: 1, settings: new StudioSettings({ "input-site": { sky_days: days } }), now, trigger: "manual", ownerId: null, dryRun: true };
}

test("the scan finds the ingress, the lunation and the station, each within minutes", async () => {
  const now = new Date("2026-11-01T11:00:00Z");
  const t0 = new Date("2026-11-01T12:00:00Z");
  const store = new MemoryStore();
  const result = await runSky(ctx(store, now), { ephemeris: synthetic(t0) });
  assert.equal(result.outcome, "ok", result.error ?? "");
  const rows = await store.sky({ from: "2026-10-01", to: "2027-01-01" });
  const close = (row: { date: string; time_paris: string | null } | undefined, exact: Date, minutes: number) => {
    assert.ok(row, "the event was found");
    const local = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(exact);
    const part = (t: string) => local.find((p) => p.type === t)?.value;
    assert.equal(row!.date, `${part("year")}-${part("month")}-${part("day")}`);
    const [h, m] = (row!.time_paris ?? "00:00").split(":").map(Number);
    const diff = Math.abs(h! * 60 + m! - (Number(part("hour")) * 60 + Number(part("minute"))));
    assert.ok(diff <= minutes, `${row!.time_paris} is ${diff} minutes from the truth`);
  };
  close(rows.find((r) => r.kind === "ingress" && r.body === "Sun"), new Date(t0.getTime() + (15 / 0.9856) * DAY), 2);
  close(rows.find((r) => r.kind === "lunation" && r.event.startsWith("Full")), new Date(t0.getTime() + (180 / (13.1764 - 0.9856)) * DAY), 2);
  close(rows.find((r) => r.kind === "station" && r.body === "Mercury"), new Date(t0.getTime() + 12 * DAY), 30);
  const station = rows.find((r) => r.kind === "station");
  assert.match(station!.event, /Mercury turns retrograde at \d+° Scorpio/);
  assert.equal(rows.filter((r) => r.kind === "ingress" && r.body === "Moon").length, 0, "the Moon's ingresses are left out");
  assert.ok(rows.every((r) => r.source1 === "FreeAstroAPI scan"));
});

test("a date the launch plan typed in is confirmed, not doubled", async () => {
  const now = new Date("2026-11-01T11:00:00Z");
  const t0 = new Date("2026-11-01T12:00:00Z");
  const store = new MemoryStore();
  await store.upsertSky([{ date: "2026-11-16", time_paris: null, kind: "ingress", body: "Sun", sign: "Sagittarius", degree: null, event: "The Sun enters Sagittarius", source1: "the launch plan", source2: null, created_by: "kit" }]);
  await runSky(ctx(store, now), { ephemeris: synthetic(t0) });
  const sun = (await store.sky({ from: "2026-10-01", to: "2027-01-01" })).filter((r) => r.kind === "ingress" && r.body === "Sun");
  assert.equal(sun.length, 1);
  assert.equal(sun[0]!.source1, "the launch plan");
  assert.match(sun[0]!.source2 ?? "", /^FreeAstroAPI scan: 2026-11-16 \d\d:\d\d Paris$/);
  assert.ok(sun[0]!.time_paris, "the plan's missing time comes from the scan");
});

test("an eclipse is written only when the scan finds its new moon", async () => {
  // NASA: annular solar eclipse, 6 February 2027 at 16:00 UT. Put the synthetic new moon there.
  const eclipse = new Date("2027-02-06T16:00:00Z");
  const now = new Date("2027-01-25T11:00:00Z");
  const t0 = new Date("2027-01-25T12:00:00Z");
  const rate = 13.1764 - 0.9856;
  const daysToNew = (eclipse.getTime() - t0.getTime()) / DAY;
  const offset = 360 - rate * daysToNew;
  const store = new MemoryStore();
  await runSky(ctx(store, now, 20), { ephemeris: synthetic(t0, { moonOffset: offset }) });
  const rows = await store.sky({ from: "2027-01-01", to: "2027-03-01" });
  const ecl = rows.find((r) => r.kind === "eclipse");
  assert.ok(ecl, "the eclipse is in the table");
  assert.equal(ecl!.date, "2027-02-06");
  assert.match(ecl!.event, /^Annular solar eclipse in /);
  assert.match(ecl!.source2 ?? "", /new moon/);

  const off = new MemoryStore();
  const result = await runSky(ctx(off, now, 20), { ephemeris: synthetic(t0, { moonOffset: offset + 30 }) });
  assert.ok(!(await off.sky({ from: "2027-01-01", to: "2027-03-01" })).some((r) => r.kind === "eclipse"), "two days off, it is not trusted");
  assert.ok(result.log.notes.some((n) => n.includes("not written")));
});

test("samples are cached: a second run asks only for the new day", async () => {
  const t0 = new Date("2026-11-01T12:00:00Z");
  const store = new MemoryStore();
  const storage = new MemoryStorage();
  let calls = 0;
  const eph = synthetic(t0);
  const counting: Ephemeris = async (at) => {
    calls += 1;
    return eph(at);
  };
  const base = ctx(store, new Date("2026-11-01T11:00:00Z"), 20);
  await runSky({ ...base, storage }, { ephemeris: counting });
  const first = calls;
  calls = 0;
  await runSky({ ...base, storage, now: new Date("2026-11-02T11:00:00Z") }, { ephemeris: counting });
  const events = scanSamples([]).length;
  assert.equal(events, 0);
  assert.ok(first > 21, "the first run asks for every day, plus one per event");
  assert.ok(calls < first / 2, `the second run asked ${calls} times`);
});
