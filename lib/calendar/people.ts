import { ageAtDate } from "@/lib/dates.ts";
import type { ViewPerson } from "@/lib/view_data.ts";

export function monthDayOf(person: ViewPerson): string {
  if (!person.date) return "";
  return person.date.length === 10 ? person.date.slice(5) : person.date;
}

export function hasYear(person: ViewPerson): boolean {
  return Boolean(person.date) && person.date.length === 10;
}

export function ageOn(person: ViewPerson, year: number): number | null {
  return hasYear(person) ? year - Number(person.date.slice(0, 4)) : null;
}

export function milestone(age: number | null): string {
  if (!Number.isFinite(age)) return "";
  if ([1, 10, 18, 20, 25, 30, 40, 50, 60, 70, 75, 80, 90, 100].includes(age!)) {
    return "major";
  }
  if (age! > 0 && age! % 10 === 0) return "major";
  if (age! > 0 && age! % 5 === 0) return "minor";
  return "";
}

export function nextBirthdayDate(
  person: ViewPerson,
  currentYear: number,
  todayKey: string,
): string | null {
  const md = monthDayOf(person);
  if (!md) return null;
  const thisYear = `${currentYear}-${md}`;
  if ((!hasYear(person) || thisYear >= person.date) && thisYear >= todayKey) return thisYear;
  return `${currentYear + 1}-${md}`;
}

export function nextMemorialDate(
  person: ViewPerson,
  currentYear: number,
  todayKey: string,
): string | null {
  if (!person.died) return null;
  const md = person.died.slice(5);
  const thisYear = `${currentYear}-${md}`;
  return thisYear >= todayKey ? thisYear : `${currentYear + 1}-${md}`;
}

export interface PersonDetail {
  next: string | null;
  nextMemorial: string | null;
  age: number | null;
  ageAtDeath: number | null;
  born: string;
  mentionedBy: { person: ViewPerson; age: number | null }[];
}

/** Everything the detail sheet shows about a person, derived from the roster. */
export function personDetail(
  person: ViewPerson,
  people: ViewPerson[],
  currentYear: number,
  todayKey: string,
): PersonDetail {
  const next = nextBirthdayDate(person, currentYear, todayKey);
  const nextMemorial = nextMemorialDate(person, currentYear, todayKey);
  const age = hasYear(person) ? currentYear - Number(person.date.slice(0, 4)) : null;
  const born = person.date || "Unknown";
  const ageAtDeath = ageAtDate(person.date || null, person.died || null);
  // Incoming backlinks: people whose notes @-mention this person, oldest first.
  const id = person.id.toLowerCase();
  const mentionedBy = people
    .filter((p) => {
      if (p.id.toLowerCase() === id) return false;
      const regex = /@([a-z0-9-]+)/gi;
      let match;
      while ((match = regex.exec(p.notes || "")) !== null) {
        if (match[1].toLowerCase() === id) return true;
      }
      return false;
    })
    .map((p) => ({
      person: p,
      age: hasYear(p) ? currentYear - Number(p.date.slice(0, 4)) : null,
    }))
    .sort((a, b) =>
      (b.age ?? -Infinity) - (a.age ?? -Infinity) ||
      a.person.name.localeCompare(b.person.name, "nb")
    );
  return { next, nextMemorial, age, ageAtDeath, born, mentionedBy };
}
