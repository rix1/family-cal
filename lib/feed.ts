import type { Store } from "./store.ts";
import type { CalEvent, Viewer } from "./model.ts";
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

/** The feed a viewer gets: their followed groups under their personal name. */
export function feedOptionsForViewer(viewer: Viewer): FeedOptions {
  return {
    groups: viewer.groups,
    calName: viewer.name === "Everyone" ? "Family Calendar" : `Family Calendar — ${viewer.name}`,
  };
}

async function assembleFeed(
  store: Store,
  opts: FeedOptions,
): Promise<{ calName: string; events: CalEvent[] }> {
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

  return { calName: opts.calName ?? "Family Calendar", events };
}

/** Build a complete iCalendar feed from the store. */
export async function buildFeed(store: Store, opts: FeedOptions = {}): Promise<string> {
  const { calName, events } = await assembleFeed(store, opts);
  return toICalendar(events, { calName, dtstamp: opts.dtstamp });
}

/**
 * Strong ETag for the feed `opts` would produce, quoted for HTTP headers.
 * Hashes the assembled events rather than the serialized calendar, so the
 * volatile DTSTAMP never leaks in: the tag changes only when the content a
 * client would see changes (including the holiday window shifting at new year).
 */
export async function feedEtag(store: Store, opts: FeedOptions = {}): Promise<string> {
  const assembled = await assembleFeed(store, opts);
  const bytes = new TextEncoder().encode(JSON.stringify(assembled));
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  let hex = "";
  for (const byte of digest.subarray(0, 16)) hex += byte.toString(16).padStart(2, "0");
  return `"${hex}"`;
}
