/**
 * The Studio's vocabulary, shared by the agents, the workers, the server and the screens.
 * Pure data: safe to import anywhere, including client components.
 */

export const LANGUAGES = ["en", "fr"] as const;
export type Language = (typeof LANGUAGES)[number];

export const CARD_LANGUAGES = ["en", "fr", "both"] as const;
export type CardLanguage = (typeof CARD_LANGUAGES)[number];

export const PILLARS = ["test", "placements", "tested", "sky"] as const;
export type Pillar = (typeof PILLARS)[number];

export const PLATFORMS = [
  "tiktok",
  "instagram",
  "facebook",
  "youtube",
  "pinterest",
  "threads",
  "bluesky",
  "x",
  "mastodon",
  "substack",
  "medium",
  "site",
] as const;
export type Platform = (typeof PLATFORMS)[number];

export const FORMATS = ["video", "carousel", "text", "pin", "still", "story", "issue", "long_video", "article"] as const;
export type Format = (typeof FORMATS)[number];

export const CARD_STATUSES = ["draft", "approved", "killed", "used"] as const;
export type CardStatus = (typeof CARD_STATUSES)[number];

export const POST_STATUSES = ["draft", "approved", "rendered", "queued", "posted", "failed", "killed"] as const;
export type PostStatus = (typeof POST_STATUSES)[number];

export const REPLY_STATUSES = ["draft", "approved", "sent", "skipped"] as const;
export type ReplyStatus = (typeof REPLY_STATUSES)[number];

export const REPLY_CLASSES = ["question", "praise", "sceptic", "spam", "distress", "complaint", "press", "under18", "other"] as const;
export type ReplyClass = (typeof REPLY_CLASSES)[number];

export const REPLY_FLAGS = ["none", "needs_owner", "distress", "complaint", "press", "under18"] as const;
export type ReplyFlag = (typeof REPLY_FLAGS)[number];

export const REMINDER_KINDS = [
  "approve-week",
  "replies-due",
  "scorecard",
  "by-hand-post",
  "connection-expiring",
  "cap-near",
  "calendar-event",
  "sky-event",
  "custom",
  "agent",
  "tick-stalled",
] as const;
export type ReminderKind = (typeof REMINDER_KINDS)[number];

export const REMINDER_STATUSES = ["scheduled", "sent", "snoozed", "done", "cancelled"] as const;
export type ReminderStatus = (typeof REMINDER_STATUSES)[number];

export const REPEATS = ["none", "daily", "weekdays", "weekly", "monthly"] as const;
export type Repeat = (typeof REPEATS)[number];

export const CHANNELS = ["in_app", "email", "push"] as const;
export type Channel = (typeof CHANNELS)[number];

export const RUN_OUTCOMES = ["running", "ok", "failed", "capped", "skipped", "dry_run"] as const;
export type RunOutcome = (typeof RUN_OUTCOMES)[number];

export const RUN_TRIGGERS = ["cron", "dispatch", "manual", "interactive", "tick"] as const;
export type RunTrigger = (typeof RUN_TRIGGERS)[number];

export const EFFORTS = ["low", "medium", "high", "xhigh", "max"] as const;
export type Effort = (typeof EFFORTS)[number];

/** A figure on a card. A figure without a source is not a figure: it never renders unverified. */
export interface Figure {
  readonly value: string;
  readonly label: string;
  readonly source: string;
  readonly url?: string | null;
  readonly verified: boolean;
}

export interface Slide {
  readonly heading: string;
  readonly body: string;
}

/** Platforms whose pieces the owner posts by hand from Today (no usable API, or not granted yet). */
export const BY_HAND_PLATFORMS: ReadonlySet<Platform> = new Set(["tiktok", "substack", "medium", "site"]);

export function isPlatform(value: unknown): value is Platform {
  return typeof value === "string" && (PLATFORMS as readonly string[]).includes(value);
}

export function isFormat(value: unknown): value is Format {
  return typeof value === "string" && (FORMATS as readonly string[]).includes(value);
}

export function isLanguage(value: unknown): value is Language {
  return value === "en" || value === "fr";
}

export const PLATFORM_LABELS: Readonly<Record<Platform, string>> = {
  tiktok: "TikTok",
  instagram: "Instagram",
  facebook: "Facebook",
  youtube: "YouTube",
  pinterest: "Pinterest",
  threads: "Threads",
  bluesky: "Bluesky",
  x: "X",
  mastodon: "Mastodon",
  substack: "Substack",
  medium: "Medium",
  site: "The site",
};

export const PILLAR_LABELS: Readonly<Record<Pillar, string>> = {
  test: "The test",
  placements: "Placements in plain words",
  tested: "Tested first",
  sky: "The sky this week",
};

export const FORMAT_LABELS: Readonly<Record<Format, string>> = {
  video: "Short video",
  carousel: "Carousel",
  text: "Text post",
  pin: "Pin",
  still: "Still",
  story: "Story",
  issue: "The Friday issue",
  long_video: "Long video",
  article: "Article",
};
