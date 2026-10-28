/**
 * When each piece goes out: the week's slots per platform and format (Paris time, the kit's, or the
 * owner's overrides), filled by code. Timely pieces go on their sky or calendar day; the rest are spread
 * so each day gets a mix of pillars; two videos are never closer than the gap on one network; Medium
 * follows Substack fourteen days later. A piece with no free slot stays unscheduled, in the Library.
 */
import type { Kit } from "../kit/schema";
import type { StudioSettings } from "../settings";
import type { Format, Pillar, Platform } from "../types";
import { addDays, daysOf, fromParis, parisDate } from "../time";
import { slotTimesOn } from "../pieces/targets";

export interface SlotRequest {
  readonly key: string;
  readonly platform: Platform;
  readonly format: Format;
  readonly pillar: Pillar;
  /** The sky or calendar date the piece belongs to, if it is timely. */
  readonly skyDate: string | null;
}

export interface TakenSlot {
  readonly platform: Platform;
  readonly format: Format;
  readonly at: string;
}

export function planSlots(
  requests: readonly SlotRequest[],
  week: string,
  kit: Kit,
  settings: StudioSettings,
  taken: readonly TakenSlot[],
  now: Date,
): Map<string, string | null> {
  const days = daysOf(week);
  const gapMs = settings.get("outbox").video_gap_hours * 3600_000;
  const out = new Map<string, string | null>();
  const busy = new Set(taken.map((t) => `${t.platform}|${t.at}`));
  const videoTimes = new Map<Platform, number[]>();
  for (const t of taken) if (t.format === "video") videoTimes.set(t.platform, [...(videoTimes.get(t.platform) ?? []), Date.parse(t.at)]);
  const perDay = new Map<string, number>();
  for (const t of taken) {
    const k = `${t.platform}|${parisDate(new Date(t.at))}`;
    perDay.set(k, (perDay.get(k) ?? 0) + 1);
  }

  const free = (platform: Platform, format: Format, date: string): string[] => {
    const maxPerDay = settings.platform(platform).max_per_day ?? kit.platforms[platform]?.max_per_day ?? 99;
    if ((perDay.get(`${platform}|${date}`) ?? 0) >= maxPerDay) return [];
    return slotTimesOn(kit, settings, platform, format, date)
      .map((time) => fromParis(date, time).toISOString())
      .filter((iso) => Date.parse(iso) > now.getTime() && !busy.has(`${platform}|${iso}`))
      .filter((iso) => format !== "video" || (videoTimes.get(platform) ?? []).every((t) => Math.abs(t - Date.parse(iso)) >= gapMs));
  };

  const take = (r: SlotRequest, iso: string) => {
    busy.add(`${r.platform}|${iso}`);
    const date = parisDate(new Date(iso));
    perDay.set(`${r.platform}|${date}`, (perDay.get(`${r.platform}|${date}`) ?? 0) + 1);
    if (r.format === "video") videoTimes.set(r.platform, [...(videoTimes.get(r.platform) ?? []), Date.parse(iso)]);
    out.set(r.key, iso);
  };

  // Timely first, on their day (or the day before when that day is full), then the rest, pillars
  // interleaved so a day isn't all one pillar.
  const timely = requests.filter((r) => r.skyDate && days.includes(r.skyDate));
  const rest = requests.filter((r) => !(r.skyDate && days.includes(r.skyDate)));
  for (const r of timely) {
    const candidates = [r.skyDate!, addDays(r.skyDate!, -1)].filter((d) => days.includes(d));
    const slot = candidates.flatMap((d) => free(r.platform, r.format, d))[0];
    if (slot) take(r, slot);
    else rest.push(r);
  }
  const byPillar = new Map<Pillar, SlotRequest[]>();
  for (const r of rest) byPillar.set(r.pillar, [...(byPillar.get(r.pillar) ?? []), r]);
  const interleaved: SlotRequest[] = [];
  while ([...byPillar.values()].some((l) => l.length)) {
    for (const list of byPillar.values()) {
      const next = list.shift();
      if (next) interleaved.push(next);
    }
  }
  for (const r of interleaved) {
    // The day with the fewest pieces on this platform so far, then its earliest free slot.
    const ranked = [...days].sort((a, b) => (perDay.get(`${r.platform}|${a}`) ?? 0) - (perDay.get(`${r.platform}|${b}`) ?? 0) || a.localeCompare(b));
    let placed = false;
    for (const d of ranked) {
      const slot = free(r.platform, r.format, d)[0];
      if (slot) {
        take(r, slot);
        placed = true;
        break;
      }
    }
    if (!placed) out.set(r.key, null);
  }
  return out;
}

/** Medium takes the Substack issue fourteen days later, at the same time. */
export function mediumDate(substackAt: string, kit: Kit): string {
  const days = kit.platforms["medium"]?.delay_days ?? 14;
  return new Date(Date.parse(substackAt) + days * 86400_000).toISOString();
}
