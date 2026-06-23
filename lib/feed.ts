import type { Store } from "./store.ts";
import { toICalendar } from "./ical.ts";
import { birthdayEvents, holidayEvents, memorialEvents, occasionEvents } from "./events.ts";

export interface FeedOptions {
  calName?: string;
  /**
   * Followed groups to include. Undefined = no subsetting (full feed); an empty
   * array = follows nothing (empty feed). The feed endpoint passes the viewer's
   * groups, so an empty follow-list yields an empty calendar.
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

  // Followed groups are an explicit list: an undefined `groups` means "no
  // subsetting" (full feed, e.g. internal callers), but an empty array means the
  // viewer follows nothing and the feed is empty.
  let people = await store.listPeople();
  let occasions = await store.listEvents();
  if (opts.groups) {
    const want = new Set(opts.groups);
    people = people.filter((p) => want.has(p.affiliation));
    occasions = occasions.filter((event) => event.groups.some((g) => want.has(g)));
  }

  const events = [
    ...birthdayEvents(people),
    ...memorialEvents(people),
    ...occasionEvents(occasions),
    ...holidayEvents(startYear, endYear),
  ];

  return toICalendar(events, {
    calName: opts.calName ?? "Family Calendar",
    dtstamp: opts.dtstamp,
  });
}
