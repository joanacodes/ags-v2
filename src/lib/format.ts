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
