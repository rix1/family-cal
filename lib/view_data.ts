import { eventTitle } from "@/lib/family_events.ts";
import { holidaysForYears } from "@/lib/holidays.ts";
import type { FamilyEvent, GroupInfo, Person } from "@/lib/model.ts";
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
  groups: string[];
  notes: string;
  died: string;
}

export interface ViewHoliday {
  date: string;
  name: string;
  countries: Array<"NO" | "DK">;
}

/** An explicit life event (wedding, baptism, ...); all recur yearly. */
export interface ViewEvent {
  id: string;
  kind: string;
  /** Display title (custom or derived from the subjects' names). */
  title: string;
  /** `YYYY-MM-DD` or `MM-DD`. */
  date: string;
  /** Subjects that are visible to this viewer. */
  people: Array<{ id: string; name: string }>;
  /** Union of the subjects' group tags, for the client-side family filter. */
  groups: string[];
  notes: string;
}

export interface CalendarViewData {
  groups: Record<string, ViewGroup>;
  people: ViewPerson[];
  holidays: ViewHoliday[];
  events: ViewEvent[];
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
    groups: p.groups,
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

function eventsToView(events: FamilyEvent[], allPeople: Person[]): ViewEvent[] {
  const byId = new Map(allPeople.map((person) => [person.id, person]));
  return events.map((event) => {
    const subjects = event.subjects
      .map((id) => byId.get(id))
      .filter((person): person is Person => Boolean(person));
    return {
      id: event.id,
      kind: event.kind,
      title: eventTitle(event, allPeople),
      date: event.date,
      people: subjects.map((person) => ({ id: person.id, name: person.name })),
      groups: [...new Set(subjects.flatMap((person) => person.groups))],
      notes: event.notes || "",
    };
  });
}

export async function calendarViewData(
  store: Store,
  viewerGroups?: string[],
): Promise<CalendarViewData> {
  const [groups, people, events] = await Promise.all([
    store.listGroups(),
    store.listPeople(),
    store.listEvents(),
  ]);
  const visiblePeople = viewerGroups?.length
    ? people.filter((person) => person.groups.some((group) => viewerGroups.includes(group)))
    : people;
  const visibleIds = new Set(visiblePeople.map((person) => person.id));
  const visibleEvents = events.filter((event) => event.subjects.some((id) => visibleIds.has(id)));
  return {
    groups: groupsToMap(groups),
    people: peopleToView(visiblePeople),
    holidays: holidayWindow(),
    events: eventsToView(visibleEvents, people),
  };
}
