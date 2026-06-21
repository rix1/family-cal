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

export function slug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "x";
}
