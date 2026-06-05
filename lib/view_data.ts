import { holidaysForYears } from "@/lib/holidays.ts";
import type { GroupInfo, Person } from "@/lib/model.ts";
import type { Store } from "@/lib/store.ts";

export interface ViewGroup {
  label: string;
  flag: string;
}

export interface ViewPerson {
  id: string;
  name: string;
  date: string;
  type: "birthday";
  group: string;
  notes: string;
  died: string;
}

export interface ViewHoliday {
  date: string;
  name: string;
  countries: Array<"NO" | "DK">;
}

export interface CalendarViewData {
  groups: Record<string, ViewGroup>;
  people: ViewPerson[];
  holidays: ViewHoliday[];
}

function groupsToMap(groups: GroupInfo[]): Record<string, ViewGroup> {
  return Object.fromEntries(groups.map((g) => [g.key, { label: g.label, flag: g.flag }]));
}

function peopleToView(people: Person[]): ViewPerson[] {
  return people.map((p) => ({
    id: p.id,
    name: p.name,
    date: p.born || "",
    type: "birthday",
    group: p.groups[0] || "",
    notes: p.notes || "",
    died: p.died || "",
  }));
}

function holidayWindow(): ViewHoliday[] {
  const year = new Date().getFullYear();
  return holidaysForYears(year - 5, year + 50).map((h) => ({
    date: `${h.date.year}-${String(h.date.month).padStart(2, "0")}-${
      String(h.date.day).padStart(2, "0")
    }`,
    name: h.name,
    countries: h.countries,
  }));
}

export async function calendarViewData(store: Store): Promise<CalendarViewData> {
  const [groups, people] = await Promise.all([store.listGroups(), store.listPeople()]);
  return {
    groups: groupsToMap(groups),
    people: peopleToView(people),
    holidays: holidayWindow(),
  };
}
