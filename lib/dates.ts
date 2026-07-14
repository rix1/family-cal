import type { CalDate, PartialDate } from "./model.ts";

/** English month names, indexed 0-11. Use `MONTH_NAMES[month - 1]` for 1-12. */
export const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/** Three-letter English month abbreviations, indexed 0-11. */
export const MONTH_NAMES_SHORT = MONTH_NAMES.map((name) => name.slice(0, 3));

const monthNameCache = new Map<string, string[]>();

/**
 * Month names for a BCP-47 locale, indexed 0-11 — Intl gives each language its
 * native style (nb-NO: lowercase "januar", short "jan."). Cached per locale.
 */
export function localizedMonthNames(locale: string, style: "long" | "short" = "long"): string[] {
  const cacheKey = `${locale}:${style}`;
  let names = monthNameCache.get(cacheKey);
  if (!names) {
    const format = new Intl.DateTimeFormat(locale, { month: style });
    names = Array.from({ length: 12 }, (_, month) => format.format(new Date(2000, month, 15)));
    monthNameCache.set(cacheKey, names);
  }
  return names;
}

export function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** Parse a partial date into its parts, or null if it isn't a recognized form. */
export function splitDate(
  date: PartialDate | null,
): { year: number | null; month: number; day: number } | null {
  if (!date) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    const [y, m, d] = date.split("-").map(Number);
    return { year: y, month: m, day: d };
  }
  if (/^\d{2}-\d{2}$/.test(date)) {
    const [m, d] = date.split("-").map(Number);
    return { year: null, month: m, day: d };
  }
  return null;
}

/** Add `delta` days to a calendar date using UTC arithmetic (DST-safe). */
export function addDays(date: CalDate, delta: number): CalDate {
  const dt = new Date(Date.UTC(date.year, date.month - 1, date.day));
  dt.setUTCDate(dt.getUTCDate() + delta);
  return { year: dt.getUTCFullYear(), month: dt.getUTCMonth() + 1, day: dt.getUTCDate() };
}

export function ageAtDate(born: string | null, at: string | null): number | null {
  if (!born || !at || born.length !== 10 || at.length !== 10) return null;
  let age = Number(at.slice(0, 4)) - Number(born.slice(0, 4));
  if (at.slice(5) < born.slice(5)) age--;
  return age >= 0 ? age : null;
}

/** `YYYYMMDD` for an all-day DATE value. */
export function compactDate(date: CalDate): string {
  return `${date.year}${pad2(date.month)}${pad2(date.day)}`;
}

/** `YYYYMMDDTHHMMSSZ` UTC timestamp for DTSTAMP. */
export function compactStampUTC(when: Date): string {
  return (
    `${when.getUTCFullYear()}${pad2(when.getUTCMonth() + 1)}${pad2(when.getUTCDate())}` +
    `T${pad2(when.getUTCHours())}${pad2(when.getUTCMinutes())}${pad2(when.getUTCSeconds())}Z`
  );
}

/**
 * Localized "2 hours ago" for an ISO timestamp, in the largest unit that reads
 * naturally (minutes → months). `locale` is a BCP-47 tag (see `dateLocale()`).
 */
export function relativeTime(iso: string, now: Date, locale: string): string {
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  const minutes = Math.round((new Date(iso).getTime() - now.getTime()) / 60000);
  if (Math.abs(minutes) < 60) return rtf.format(minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return rtf.format(hours, "hour");
  const days = Math.round(hours / 24);
  if (Math.abs(days) < 7) return rtf.format(days, "day");
  if (Math.abs(days) < 35) return rtf.format(Math.round(days / 7), "week");
  return rtf.format(Math.round(days / 30), "month");
}

export function slug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "x";
}
