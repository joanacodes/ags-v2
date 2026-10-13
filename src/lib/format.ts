const DATE_FORMAT = new Intl.DateTimeFormat("en-GB", {
  year: "numeric",
  month: "short",
  day: "numeric",
});

const LONG_DATE_FORMAT = new Intl.DateTimeFormat("en-GB", {
  year: "numeric",
  month: "long",
  day: "numeric",
});

export function formatDate(isoDate: string): string {
  return DATE_FORMAT.format(new Date(`${isoDate}T00:00:00`));
}

export function formatLongDate(isoDate: string): string {
  return LONG_DATE_FORMAT.format(new Date(`${isoDate}T00:00:00`));
}

export function formatBirthMoment(date: string, time?: string): string {
  const base = formatLongDate(date);
  return time ? `${base} · ${formatLocalTime(time)} LT` : base;
}

export function formatLocalTime(time: string): string {
  return time;
}

export function formatMinutes(minutes: number): string {
  return `~${minutes} min`;
}

export function formatPercent(value: number): string {
  return `${Math.round(value)}%`;
}

/** 1 -> "1st", 2 -> "2nd", 11 -> "11th" … */
export function ordinal(n: number): string {
  const rem10 = n % 10;
  const rem100 = n % 100;
  if (rem10 === 1 && rem100 !== 11) return `${n}st`;
  if (rem10 === 2 && rem100 !== 12) return `${n}nd`;
  if (rem10 === 3 && rem100 !== 13) return `${n}rd`;
  return `${n}th`;
}

/**
 * How long ago, in words: "Just now", "5 min ago", "3h ago", "Yesterday",
 * "4 days ago", "2 weeks ago", then the date. Measured in elapsed time, so
 * it reads the same in every time zone.
 */
export function formatAgo(iso: string, now: Date = new Date()): string {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return "";
  const minutes = Math.max(0, Math.floor((now.getTime() - then) / 60_000));
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  if (days < 35) return `${Math.floor(days / 7)} week${days < 14 ? "" : "s"} ago`;
  return DATE_FORMAT.format(new Date(then));
}
