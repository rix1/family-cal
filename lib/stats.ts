/**
 * Inferred family statistics for the admin dashboard. Everything here is
 * computed from the stored people/viewers — nothing is persisted. Age-based
 * figures only consider members with a full birth date, so they stay honest
 * even while many birthdays are still unknown.
 */

import { ageAtDate, splitDate } from "@/lib/dates.ts";
import { type Person, type Viewer, viewerIsActive } from "@/lib/model.ts";
import { activeSubscribers } from "@/lib/newsletter.ts";

export interface NamedAge {
  name: string;
  age: number;
}

export interface FamilyStats {
  totalPeople: number;
  living: number;
  inMemory: number;
  /** People with a full `YYYY-MM-DD` birth date. */
  birthDatesKnown: number;
  /** Mean age of living members with a known birth year, or null if none. */
  averageAge: number | null;
  oldest: NamedAge | null;
  youngest: NamedAge | null;
  /** The birth month shared by the most people (1-12), earliest month on ties. */
  busiestMonth: { month: number; count: number } | null;
  subscribers: number;
  activeViewers: number;
}

export function familyStats(
  people: Person[],
  viewers: Viewer[],
  today: string,
): FamilyStats {
  const living = people.filter((p) => !p.died);

  const ages: NamedAge[] = [];
  for (const person of living) {
    const age = ageAtDate(person.born, today);
    if (age !== null) ages.push({ name: person.name, age });
  }
  ages.sort((a, b) => b.age - a.age || a.name.localeCompare(b.name, "nb"));

  const averageAge = ages.length
    ? Math.round(ages.reduce((sum, a) => sum + a.age, 0) / ages.length)
    : null;

  const monthCounts = new Map<number, number>();
  for (const person of people) {
    const parts = splitDate(person.born);
    if (parts) monthCounts.set(parts.month, (monthCounts.get(parts.month) ?? 0) + 1);
  }
  let busiestMonth: { month: number; count: number } | null = null;
  for (let month = 1; month <= 12; month++) {
    const count = monthCounts.get(month) ?? 0;
    if (count > 0 && (!busiestMonth || count > busiestMonth.count)) {
      busiestMonth = { month, count };
    }
  }

  return {
    totalPeople: people.length,
    living: living.length,
    inMemory: people.length - living.length,
    birthDatesKnown: people.filter((p) => p.born?.length === 10).length,
    averageAge,
    oldest: ages[0] ?? null,
    youngest: ages.at(-1) ?? null,
    busiestMonth,
    subscribers: activeSubscribers(viewers).length,
    activeViewers: viewers.filter(viewerIsActive).length,
  };
}
