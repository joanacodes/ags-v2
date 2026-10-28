/**
 * Which platform and format each card becomes, decided by code before anyone writes: the card's formats,
 * the platforms of its language (the kit), what each platform takes, what the owner turned off, and the
 * week's room (slots × days, the warm-up, the kit's per-week counts). Writing a piece that has no slot
 * would cost tokens for nothing, so the room is counted here, in the cards' order (timely first).
 */
import type { Kit } from "../kit/schema";
import type { StudioSettings } from "../settings";
import type { CardLanguage, Format, Language, Platform } from "../types";
import { slotsFor } from "../kit/load";
import { daysOf, weekdayOf } from "../time";

export interface Target {
  readonly platform: Platform;
  readonly format: Format;
  readonly language: Language;
}

export function languagesOf(language: CardLanguage): Language[] {
  return language === "both" ? ["en", "fr"] : [language];
}

const DAY_CODES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** The Paris times a platform posts a format on one date, after the owner's overrides and the warm-up. */
export function slotTimesOn(kit: Kit, settings: StudioSettings, platform: Platform, format: Format, date: string): string[] {
  const override = settings.platform(platform).slots;
  const base = override ?? slotsFor(kit, platform, format);
  const day = DAY_CODES[weekdayOf(date)];
  const times: string[] = [];
  for (const slot of base) {
    const m = /^(?:(Mon|Tue|Wed|Thu|Fri|Sat|Sun) )?(\d{2}:\d{2})$/.exec(slot);
    if (!m) continue;
    if (m[1] && m[1] !== day) continue;
    times.push(m[2]!);
  }
  const warmupUntil = settings.get("global").warmup_until;
  if (format === "video" && warmupUntil && date <= warmupUntil) return times.slice(0, 1);
  return times;
}

/** How many pieces of a format a platform can take in the week. */
export function weekRoom(kit: Kit, settings: StudioSettings, platform: Platform, format: Format, week: string): number {
  const conf = kit.platforms[platform];
  if (!conf) return 0;
  if (conf.by_hand && !conf.slots) return format === "article" ? 7 : 0;
  let room = daysOf(week).reduce((n, date) => n + slotTimesOn(kit, settings, platform, format, date).length, 0);
  const perWeek = conf.per_week?.[format];
  if (perWeek !== undefined) room = Math.min(room, perWeek);
  const maxPerDay = settings.platform(platform).max_per_day ?? conf.max_per_day;
  if (maxPerDay !== undefined) room = Math.min(room, maxPerDay * 7);
  return room;
}

/** How many pieces a platform can take in the week across its formats (the slots it shares, its daily cap). */
export function platformRoom(kit: Kit, settings: StudioSettings, platform: Platform, week: string): number {
  const conf = kit.platforms[platform];
  if (!conf) return 0;
  const maxPerDay = settings.platform(platform).max_per_day ?? conf.max_per_day;
  let room = Number.POSITIVE_INFINITY;
  if (maxPerDay !== undefined) room = maxPerDay * 7;
  // One list of times for every format: the formats share them.
  const shared = settings.platform(platform).slots ?? (Array.isArray(conf.slots) ? conf.slots : null);
  if (shared) room = Math.min(room, shared.length * 7);
  return room;
}

/** What each card will be written as, card by card, in order, until each platform's room is full. */
export function assignTargets(
  cards: readonly { id: string; language: CardLanguage; formats: readonly Format[] }[],
  kit: Kit,
  settings: StudioSettings,
  week: string,
  alreadyTaken: ReadonlyMap<string, number> = new Map(),
): Map<string, Target[]> {
  const usedFormat = new Map<string, number>(alreadyTaken);
  const usedPlatform = new Map<string, number>();
  for (const [key, n] of alreadyTaken) {
    const platform = key.split("|")[0]!;
    usedPlatform.set(platform, (usedPlatform.get(platform) ?? 0) + n);
  }
  const cache = new Map<string, number>();
  const memo = (key: string, f: () => number) => {
    if (!cache.has(key)) cache.set(key, f());
    return cache.get(key) ?? 0;
  };
  const out = new Map<string, Target[]>();
  for (const card of cards) {
    const targets: Target[] = [];
    for (const language of languagesOf(card.language)) {
      for (const platform of kit.languages[language] as Platform[]) {
        const conf = kit.platforms[platform];
        if (!conf || !settings.platform(platform).enabled) continue;
        for (const format of card.formats) {
          if (!conf.formats.includes(format)) continue;
          // Medium takes Substack's issue two weeks later; it is never written on its own.
          if (platform === "medium") continue;
          const fKey = `${platform}|${format}`;
          if ((usedFormat.get(fKey) ?? 0) >= memo(fKey, () => weekRoom(kit, settings, platform, format, week))) continue;
          if ((usedPlatform.get(platform) ?? 0) >= memo(platform, () => platformRoom(kit, settings, platform, week))) continue;
          usedFormat.set(fKey, (usedFormat.get(fKey) ?? 0) + 1);
          usedPlatform.set(platform, (usedPlatform.get(platform) ?? 0) + 1);
          targets.push({ platform, format, language });
        }
      }
    }
    out.set(card.id, targets);
  }
  return out;
}
