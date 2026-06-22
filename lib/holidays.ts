import type { CalDate, Country } from "./model.ts";
import { addDays } from "./dates.ts";

export interface Holiday {
  date: CalDate;
  name: string;
  countries: Country[];
}

/**
 * Display name for a holiday: country-qualified when observed in only one of the
 * two countries ("Norwegian Constitution Day"), or the plain name when shared
 * ("Christmas Day").
 */
export function holidayLabel(holiday: Pick<Holiday, "name" | "countries">): string {
  const no = holiday.countries.includes("NO");
  const dk = holiday.countries.includes("DK");
  if (no && !dk) return `Norwegian ${holiday.name}`;
  if (dk && !no) return `Danish ${holiday.name}`;
  return holiday.name;
}

/**
 * Easter Sunday for a given year (Gregorian / Anonymous algorithm, Meeus).
 * Deterministic — this is why holidays need no external API.
 */
export function easterSunday(year: number): CalDate {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31); // 3 = March, 4 = April
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return { year, month, day };
}

const FIXED: Array<{ month: number; day: number; name: string; countries: Country[] }> = [
  { month: 1, day: 1, name: "New Year's Day", countries: ["NO", "DK"] },
  { month: 5, day: 1, name: "Labour Day", countries: ["NO"] },
  { month: 5, day: 17, name: "Constitution Day", countries: ["NO"] },
  { month: 6, day: 5, name: "Constitution Day", countries: ["DK"] },
  { month: 12, day: 24, name: "Christmas Eve", countries: ["DK"] },
  { month: 12, day: 25, name: "Christmas Day", countries: ["NO", "DK"] },
  { month: 12, day: 26, name: "Boxing Day", countries: ["NO", "DK"] },
  { month: 12, day: 31, name: "New Year's Eve", countries: ["DK"] },
];

const EASTER_RELATIVE: Array<{ offset: number; name: string; countries: Country[] }> = [
  { offset: -3, name: "Maundy Thursday", countries: ["NO", "DK"] },
  { offset: -2, name: "Good Friday", countries: ["NO", "DK"] },
  { offset: 0, name: "Easter Sunday", countries: ["NO", "DK"] },
  { offset: 1, name: "Easter Monday", countries: ["NO", "DK"] },
  { offset: 39, name: "Ascension Day", countries: ["NO", "DK"] },
  { offset: 49, name: "Whit Sunday", countries: ["NO", "DK"] },
  { offset: 50, name: "Whit Monday", countries: ["NO", "DK"] },
];

/** All NO/DK public holidays for one year, sorted by date. */
export function holidaysForYear(year: number): Holiday[] {
  const easter = easterSunday(year);
  const holidays: Holiday[] = [
    ...FIXED.map((h) => ({
      date: { year, month: h.month, day: h.day },
      name: h.name,
      countries: h.countries,
    })),
    ...EASTER_RELATIVE.map((h) => ({
      date: addDays(easter, h.offset),
      name: h.name,
      countries: h.countries,
    })),
  ];
  return holidays.sort(
    (a, b) =>
      a.date.month - b.date.month || a.date.day - b.date.day || a.name.localeCompare(b.name),
  );
}

/** Holidays across an inclusive range of years, optionally filtered by country. */
export function holidaysForYears(
  startYear: number,
  endYear: number,
  countries: Country[] = ["NO", "DK"],
): Holiday[] {
  const want = new Set(countries);
  const all: Holiday[] = [];
  for (let year = startYear; year <= endYear; year++) {
    for (const h of holidaysForYear(year)) {
      if (h.countries.some((c) => want.has(c))) all.push(h);
    }
  }
  return all;
}
