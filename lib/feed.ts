import type { Store } from "./store.ts";
import { toICalendar } from "./ical.ts";
import { birthdayEvents, holidayEvents, memorialEvents, occasionEvents } from "./events.ts";

export interface FeedOptions {
  calName?: string;
  /**
   * Visibility tags to include. Empty/undefined = everyone. This is the seam
   * for per-viewer subsetting; the feed endpoint will pass a viewer's groups.
   */
  groups?: string[];
  /** Holiday window, in years relative to `now`. */
  pastYears?: number;
  futureYears?: number;
  /** Injectable clock for deterministic tests. */
  now?: Date;
  dtstamp?: Date;
}

/** Build a complete iCalendar feed from the store. */
export async function buildFeed(store: Store, opts: FeedOptions = {}): Promise<string> {
  const now = opts.now ?? new Date();
  const year = now.getUTCFullYear();
  const startYear = year - (opts.pastYears ?? 1);
  const endYear = year + (opts.futureYears ?? 3);

  const allPeople = await store.listPeople();
  let people = allPeople;
  if (opts.groups?.length) {
    const want = new Set(opts.groups);
    people = people.filter((p) => p.groups.some((g) => want.has(g)));
  }

  // An explicit event is relevant when any of its subjects is in the subset;
  // names still resolve against everyone (e.g. a cross-group wedding).
  const visibleIds = new Set(people.map((p) => p.id));
  const occasions = (await store.listEvents()).filter((event) =>
    event.subjects.some((id) => visibleIds.has(id))
  );

  const events = [
    ...birthdayEvents(people),
    ...memorialEvents(people),
    ...occasionEvents(occasions, allPeople),
    ...holidayEvents(startYear, endYear),
  ];

  return toICalendar(events, {
    calName: opts.calName ?? "Family Calendar",
    dtstamp: opts.dtstamp,
  });
}
