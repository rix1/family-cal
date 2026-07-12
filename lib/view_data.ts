import { holidayLabel, holidaysForYears } from "@/lib/holidays.ts";
import { type FamilyEvent, type GroupInfo, isPersonalGroup, type Person } from "@/lib/model.ts";
import type { Store } from "@/lib/store.ts";

export interface ViewGroup {
  label: string;
  color: string;
  /** "personal" marks a viewer-created list; absent means family branch. */
  kind?: "personal";
}

export interface ViewPerson {
  id: string;
  name: string;
  date: string;
  type: "birthday";
  affiliation: string;
  notes: string;
  died: string;
}

export interface ViewHoliday {
  date: string;
  name: string;
}

/** An explicit life event (wedding, baptism, ...); all recur yearly. */
export interface ViewEvent {
  id: string;
  kind: string;
  title: string;
  /** `YYYY-MM-DD` (legacy data may be a year-less `MM-DD`). */
  date: string;
  /** Visibility tags, for the client-side group filter. */
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
  return Object.fromEntries(groups.map((g) => [
    g.key,
    {
      label: g.label,
      color: g.color,
      ...(isPersonalGroup(g) ? { kind: "personal" as const } : {}),
    },
  ]));
}

function peopleToView(people: Person[]): ViewPerson[] {
  return people.map((p) => ({
    id: p.id,
    name: p.name,
    date: p.born || "",
    type: "birthday",
    affiliation: p.affiliation,
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
    name: holidayLabel(h),
  }));
}

function eventsToView(events: FamilyEvent[]): ViewEvent[] {
  return events.map((event) => ({
    id: event.id,
    kind: event.kind,
    title: event.title,
    date: event.date,
    groups: event.groups,
    notes: event.notes || "",
  }));
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
  // Groups are an explicit follow-list now. Undefined = no subsetting (full
  // view); an empty array = follows nothing, so you see nobody. A person belongs
  // to one group; an event can surface to several.
  const followed = viewerGroups ? new Set(viewerGroups) : null;
  const visiblePeople = followed
    ? people.filter((person) => followed.has(person.affiliation))
    : people;
  const visibleEvents = followed
    ? events.filter((event) => event.groups.some((group) => followed.has(group)))
    : events;
  // The group map names every group the client may mention: branches and
  // shared lists always (the filter shows unfollowed ones disabled), but other
  // people's unlisted lists must not leak — owners follow their own, so
  // "followed" covers those.
  const visibleGroups = groups.filter(
    (group) => !isPersonalGroup(group) || group.listed || !followed || followed.has(group.key),
  );
  return {
    groups: groupsToMap(visibleGroups),
    people: peopleToView(visiblePeople),
    holidays: holidayWindow(),
    events: eventsToView(visibleEvents),
  };
}
