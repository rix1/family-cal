import { dateLocale, t } from "@/lib/i18n.ts";

export const dayMs = 86_400_000;

export function toKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function parseDate(key: string): Date {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day);
}

export function compareDateKeys(a: string, b: string): number {
  const partsA = a.split("-").map(Number);
  const partsB = b.split("-").map(Number);
  const fullA = partsA.length === 3;
  const fullB = partsB.length === 3;
  const timeA = fullA
    ? new Date(partsA[0], partsA[1] - 1, partsA[2]).getTime()
    : new Date(9999, partsA[0] - 1, partsA[1]).getTime();
  const timeB = fullB
    ? new Date(partsB[0], partsB[1] - 1, partsB[2]).getTime()
    : new Date(9999, partsB[0] - 1, partsB[1]).getTime();
  return timeA - timeB;
}

export function compareMonthDayKeys(a: string, b: string): number {
  const partsA = a.split("-").map(Number);
  const partsB = b.split("-").map(Number);
  const monthA = partsA.length === 3 ? partsA[1] : partsA[0];
  const dayA = partsA.length === 3 ? partsA[2] : partsA[1];
  const monthB = partsB.length === 3 ? partsB[1] : partsB[0];
  const dayB = partsB.length === 3 ? partsB[2] : partsB[1];
  return monthA - monthB || dayA - dayB;
}

export function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

export function firstOfMonthOffset(today: Date, offset: number): Date {
  return new Date(today.getFullYear(), today.getMonth() + offset, 1);
}

// Locale-aware Intl formatters, cached because they run in loops (heatmap
// tooltips, table rows, timeline days). The locale is fixed for the lifetime
// of a page load (the language toggle does a full reload), so one instance per
// options-set is enough in practice; the Map keys by locale to stay correct.
function cachedFormat(options: Intl.DateTimeFormatOptions): () => Intl.DateTimeFormat {
  const formatters = new Map<string, Intl.DateTimeFormat>();
  return () => {
    const locale = dateLocale();
    let format = formatters.get(locale);
    if (!format) {
      format = new Intl.DateTimeFormat(locale, options);
      formatters.set(locale, format);
    }
    return format;
  };
}

/** "15. jan." / "15 Jan" */
export const shortDateFormat = cachedFormat({ day: "numeric", month: "short" });
/** "man. 15" — timeline day column */
export const dayFormat = cachedFormat({ weekday: "short", day: "numeric" });
/** "mandag 15. januar 2026" — page header */
export const longDateFormat = cachedFormat({
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
});
/** "januar 2026" — month headings */
export const monthFormat = cachedFormat({ month: "long", year: "numeric" });
/** "15. januar 2026" */
export const fullDateFormat = cachedFormat({ day: "numeric", month: "long", year: "numeric" });
/** "15. januar" — dates without a known year */
export const dayMonthFormat = cachedFormat({ day: "numeric", month: "long" });
/** "15. jan. 2026" — table cells */
export const tableDateFormat = cachedFormat({ day: "numeric", month: "short", year: "numeric" });

export function shortDate(date: string): string {
  return shortDateFormat().format(
    new Date(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10))),
  );
}

/** Render a stored date (YYYY-MM-DD, or MM-DD when the year is unknown) for reading. */
export function formatPersonDate(value: string | null | undefined): string {
  // "Unknown" is a stored data sentinel — compare literally, translate only the display.
  if (!value || value === "Unknown") return t("common.unknown");
  const parts = value.split("-").map(Number);
  if (parts.length === 3) {
    const [year, month, day] = parts;
    return fullDateFormat().format(new Date(year, month - 1, day));
  }
  const [month, day] = parts;
  return dayMonthFormat().format(new Date(2000, month - 1, day));
}

export function formatTableDate(value: string): string {
  return value.length === 10 ? tableDateFormat().format(parseDate(value)) : formatPersonDate(value);
}

/** "i dag" / "om 3 dager" / "for 2 dager siden" relative to `todayKey`. */
export function relativeLabel(dateKey: string, todayKey: string): string {
  const days = Math.round(
    (parseDate(dateKey).getTime() - parseDate(todayKey).getTime()) / dayMs,
  );
  if (days === 0) return t("calendar.rel.today");
  if (days === 1) return t("calendar.rel.tomorrow");
  if (days === -1) return t("calendar.rel.yesterday");
  if (days > 0) return t("calendar.rel.inDays", { days });
  return t("calendar.rel.daysAgo", { days: Math.abs(days) });
}
