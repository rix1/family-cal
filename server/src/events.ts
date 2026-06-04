import type { CalEvent, Country, Person } from "./model.ts";
import { slug, splitDate } from "./dates.ts";
import { holidaysForYears } from "./holidays.ts";

const FLAGS: Record<Country, string> = { NO: "🇳🇴", DK: "🇩🇰" };

/**
 * Reminder policy by event kind. This is the seam for per-viewer reminder
 * preferences later; for now these are the shared defaults.
 *
 * Triggers are relative to an all-day event anchored at 00:00, so `-PT15H`
 * fires at ~09:00 the day before (never midnight). Birthdays remind; the rest
 * stay quiet by default.
 */
export const reminderDefaults: Record<string, string[]> = {
  birthday: ["-PT15H"],
  memorial: [],
  holiday: [],
};

/** Anchor year for recurring events whose real year is unknown. */
const UNKNOWN_YEAR_ANCHOR = 1900;

/**
 * Birthday events (recurring yearly). Summaries deliberately omit the age: a
 * single RRULE event has one title for all years, and age changes annually —
 * the rich web view computes age/"would have turned". Deceased people get a
 * memorial-flavored title instead of being dropped.
 */
export function birthdayEvents(people: Person[]): CalEvent[] {
  const events: CalEvent[] = [];
  for (const person of people) {
    const parts = splitDate(person.born);
    if (!parts) continue;
    const deceased = Boolean(person.died);
    events.push({
      uid: `bday-${person.id}@family-cal`,
      summary: deceased ? `🕯️ ${person.name} (birthday)` : `🎂 ${person.name}`,
      description: person.notes || undefined,
      start: { year: parts.year ?? UNKNOWN_YEAR_ANCHOR, month: parts.month, day: parts.day },
      recurring: true,
      reminders: deceased ? [] : reminderDefaults.birthday,
      categories: ["Birthday"],
    });
  }
  return events;
}

/** Death-anniversary remembrances (recurring yearly), one per person with a death date. */
export function memorialEvents(people: Person[]): CalEvent[] {
  const events: CalEvent[] = [];
  for (const person of people) {
    const parts = splitDate(person.died);
    if (!parts) continue;
    events.push({
      uid: `memorial-${person.id}@family-cal`,
      summary: `🕯️ In memory of ${person.name}`,
      start: { year: parts.year ?? UNKNOWN_YEAR_ANCHOR, month: parts.month, day: parts.day },
      recurring: true,
      reminders: reminderDefaults.memorial,
      categories: ["Remembrance"],
    });
  }
  return events;
}

/**
 * Holiday events for a window of years. These are NOT recurring: Easter-relative
 * dates move every year, so each occurrence is an explicit dated event.
 */
export function holidayEvents(
  startYear: number,
  endYear: number,
  countries: Country[] = ["NO", "DK"],
): CalEvent[] {
  return holidaysForYears(startYear, endYear, countries).map((h) => {
    const flags = h.countries.map((c) => FLAGS[c]).join("");
    const date = `${h.date.year}${String(h.date.month).padStart(2, "0")}${
      String(h.date.day).padStart(2, "0")
    }`;
    return {
      uid: `holiday-${date}-${slug(h.name)}@family-cal`,
      summary: `${flags} ${h.name}`,
      start: h.date,
      recurring: false,
      reminders: reminderDefaults.holiday,
      categories: ["Holiday", ...h.countries],
    } satisfies CalEvent;
  });
}
