/**
 * Domain model for the family calendar.
 *
 * `Person` is the canonical fact. Birthdays are derived from `born`; explicit
 * life events (weddings, baptisms, ...) will live in a separate `Event` type
 * later. Per the architecture, holidays, ages and "would have turned" are
 * *computed*, never stored.
 */

/** A date string: full ISO `YYYY-MM-DD`, recurring `MM-DD`, or `null` if unknown. */
export type PartialDate = string;

export interface Person {
  id: string;
  name: string;
  /** Birth date: `YYYY-MM-DD` (full), `MM-DD` (year unknown), or null. */
  born: PartialDate | null;
  /** Death date: `YYYY-MM-DD` or null. Drives "in memory" + remembrance. */
  died: PartialDate | null;
  /** Many-to-many visibility tags (NOT access control). */
  groups: string[];
  /** Free text for informal color ("praktikant for Sigurd"). */
  notes: string;
}

export interface GroupInfo {
  key: string;
  label: string;
  flag: string;
}

/** Country codes used for holiday sets. */
export type Country = "NO" | "DK";

/** A normalized, render-ready calendar entry consumed by the iCal serializer. */
export interface CalEvent {
  uid: string;
  summary: string;
  description?: string;
  /** All-day anchor date. For recurring events this is the first occurrence. */
  start: CalDate;
  /** When true, emit `RRULE:FREQ=YEARLY`. */
  recurring: boolean;
  /** iCal `TRIGGER` values for embedded reminders, e.g. `"-PT15H"`. */
  reminders: string[];
  categories?: string[];
}

export interface CalDate {
  year: number;
  month: number; // 1-12
  day: number; // 1-31
}
