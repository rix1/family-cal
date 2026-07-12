import { ageAtDate } from "@/lib/dates.ts";
import { t } from "@/lib/i18n.ts";
import type { ViewEvent, ViewPerson } from "@/lib/view_data.ts";
import { compareDateKeys, compareMonthDayKeys } from "@/lib/calendar/dates.ts";
import { occasionLabel } from "@/lib/calendar/labels.ts";
import { ageOn, hasYear, milestone, monthDayOf } from "@/lib/calendar/people.ts";

export type CalendarEvent =
  | {
    date: string;
    type: "birthday";
    name: string;
    person: ViewPerson;
    age: number | null;
    flare: string;
  }
  | {
    date: string;
    type: "holiday";
    name: string;
  }
  | {
    date: string;
    type: "memorial";
    name: string;
    person: ViewPerson;
  }
  | {
    date: string;
    type: "occasion";
    kind: string;
    name: string;
    occasion: ViewEvent;
    years: number | null;
  };

export type BirthdayEvent = Extract<CalendarEvent, { type: "birthday" }>;

/** One table-view row, selected by next upcoming occurrence and dated by stored date. */
export interface TableRow {
  key: string;
  name: string;
  date: string;
  nextDate: string;
  age: number | null;
  note: string;
  person: ViewPerson | null;
  /** Group key for the colored badge (birthdays/memorials); null for the rest. */
  affiliation: string | null;
  /** Neutral badge text for occasions/holidays. */
  badge: string | null;
}

export type TableSortKey = "age" | "date" | "name" | "next";
export interface TableSort {
  key: TableSortKey;
  dir: 1 | -1;
}

/** Every occurrence of every event between `startYear` and `endYear`, date-sorted. */
export function buildRawEvents(
  people: ViewPerson[],
  holidays: { date: string; name: string }[],
  occasions: ViewEvent[],
  startYear: number,
  endYear: number,
): CalendarEvent[] {
  const out: CalendarEvent[] = [];

  for (let year = startYear; year <= endYear; year++) {
    for (const person of people) {
      if (person.date) {
        const md = monthDayOf(person);
        const date = `${year}-${md}`;
        if (!hasYear(person) || date >= person.date) {
          const age = ageOn(person, year);
          out.push({
            date,
            type: "birthday",
            name: person.name,
            person,
            age,
            flare: milestone(age),
          });
        }
      }
      if (person.died) {
        const diedMonthDay = person.died.slice(5);
        const memorialDate = `${year}-${diedMonthDay}`;
        if (memorialDate >= person.died) {
          out.push({
            date: memorialDate,
            type: "memorial",
            name: t("calendar.inMemoryOf", { name: person.name }),
            person,
          });
        }
      }
    }

    for (const occasion of occasions) {
      const hasYr = occasion.date.length === 10;
      const md = hasYr ? occasion.date.slice(5) : occasion.date;
      const date = `${year}-${md}`;
      if (hasYr && date < occasion.date) continue;
      out.push({
        date,
        type: "occasion",
        kind: occasion.kind,
        name: occasion.title,
        occasion,
        years: hasYr ? year - Number(occasion.date.slice(0, 4)) : null,
      });
    }
  }

  for (const holiday of holidays) {
    const year = Number(holiday.date.slice(0, 4));
    if (year >= startYear && year <= endYear) {
      out.push({ ...holiday, type: "holiday" });
    }
  }

  return out.sort(
    (a, b) => a.date.localeCompare(b.date) || a.type.localeCompare(b.type),
  );
}

/** Apply the type/group filters and the free-text search. */
export function filterEvents(
  rawEvents: CalendarEvent[],
  activeGroups: Set<string>,
  activeTypes: Set<string>,
  query: string,
): CalendarEvent[] {
  const q = query.trim().toLowerCase();
  return rawEvents.filter((event) => {
    if (event.type === "holiday") {
      if (!activeTypes.has("holiday")) return false;
      return !q || event.name.toLowerCase().includes(q);
    }
    if (event.type === "occasion") {
      if (!activeTypes.has(event.kind)) return false;
      if (!event.occasion.groups.some((group) => activeGroups.has(group))) return false;
      const haystack = `${event.name} ${event.occasion.notes}`.toLowerCase();
      return !q || haystack.includes(q);
    }
    if (!activeTypes.has(event.type)) return false;
    // The "gått bort" toggle (the memorial key) gates the person, not just
    // the event kind: birthdays of those who have passed ride it too.
    if (event.type === "birthday" && event.person.died && !activeTypes.has("memorial")) {
      return false;
    }
    if (!activeGroups.has(event.person.affiliation)) return false;
    const haystack = `${event.name} ${event.person.notes || ""}`.toLowerCase();
    return !q || haystack.includes(q);
  });
}

// Table view: one row per item, dated at its next upcoming occurrence.
// `events` must be date-sorted, so the first hit per identity is the next one.
export function buildTableRows(events: CalendarEvent[], todayKey: string): TableRow[] {
  const seen = new Set<string>();
  const rows: TableRow[] = [];
  for (const event of events) {
    if (event.date < todayKey) continue;
    const key = event.type === "birthday"
      ? `birthday-${event.person.id}`
      : event.type === "memorial"
      ? `memorial-${event.person.id}`
      : event.type === "occasion"
      ? `occasion-${event.occasion.id}`
      : `holiday-${event.name}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (event.type === "birthday") {
      rows.push({
        key,
        name: event.name,
        date: event.person.date,
        nextDate: event.date,
        age: event.person.died
          ? ageAtDate(event.person.date, event.person.died)
          : ageAtDate(event.person.date, todayKey),
        note: event.person.notes || "",
        person: event.person,
        affiliation: event.person.affiliation,
        badge: null,
      });
    } else if (event.type === "memorial") {
      rows.push({
        key,
        name: event.name,
        date: event.person.died,
        nextDate: event.date,
        age: null,
        note: event.person.notes || "",
        person: event.person,
        affiliation: event.person.affiliation,
        badge: null,
      });
    } else if (event.type === "occasion") {
      rows.push({
        key,
        name: event.name,
        date: event.occasion.date,
        nextDate: event.date,
        age: event.years,
        note: event.occasion.notes || "",
        person: null,
        affiliation: null,
        badge: occasionLabel(event.kind),
      });
    } else {
      rows.push({
        key,
        name: event.name,
        date: event.date,
        nextDate: event.date,
        age: null,
        note: "",
        person: null,
        affiliation: null,
        badge: t("calendar.holiday"),
      });
    }
  }
  return rows;
}

export function sortTableRows(rows: TableRow[], sort: TableSort): TableRow[] {
  const dir = sort.dir;
  const byName = (a: TableRow, b: TableRow) => a.name.localeCompare(b.name, "nb");
  return [...rows].sort((a, b) => {
    if (sort.key === "name") return dir * byName(a, b);
    if (sort.key === "date") {
      return dir * compareMonthDayKeys(a.date, b.date) || byName(a, b);
    }
    if (sort.key === "next") {
      return dir * compareDateKeys(a.nextDate, b.nextDate) || byName(a, b);
    }
    // Ageless rows (holidays, remembrances) sink to the bottom either direction.
    if (a.age === null || b.age === null) {
      if (a.age === b.age) return byName(a, b);
      return a.age === null ? 1 : -1;
    }
    return dir * (a.age - b.age) || -dir * compareDateKeys(a.date, b.date) || byName(a, b);
  });
}

// `dropToday` skips the "… today" variant where a relative label already says it.
export function ageText(event: BirthdayEvent, todayKey: string, dropToday = false): string {
  if (event.age == null) return "";
  const age = event.age;
  if (event.person.died) return t("calendar.age.wouldHaveTurned", { age });
  if (event.date < todayKey) return t("calendar.age.turned", { age });
  if (event.date === todayKey && !dropToday) return t("calendar.age.turnsToday", { age });
  return t("calendar.age.turns", { age });
}
