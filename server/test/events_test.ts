import { birthdayEvents, holidayEvents, memorialEvents, reminderDefaults } from "../src/events.ts";
import type { Person } from "../src/model.ts";
import { assert, assertEquals } from "./asserts.ts";

const person = (over: Partial<Person>): Person => ({
  id: "x",
  name: "X",
  born: null,
  died: null,
  groups: ["no"],
  notes: "",
  ...over,
});

Deno.test("birthdayEvents: full date anchors to birth year, recurring, with reminder", () => {
  const [ev] = birthdayEvents([person({ id: "aase", name: "Åse", born: "1957-08-05" })]);
  assertEquals(ev.start, { year: 1957, month: 8, day: 16 });
  assert(ev.recurring);
  assertEquals(ev.reminders, reminderDefaults.birthday);
  assertEquals(ev.summary, "🎂 Åse");
});

Deno.test("birthdayEvents: unknown year uses the anchor and still recurs", () => {
  const [ev] = birthdayEvents([person({ id: "sverre", name: "Sverre", born: "03-30" })]);
  assertEquals(ev.start, { year: 1900, month: 3, day: 30 });
  assert(ev.recurring);
});

Deno.test("birthdayEvents: people with no date are skipped", () => {
  assertEquals(birthdayEvents([person({ born: null })]).length, 0);
});

Deno.test("birthdayEvents: deceased gets memorial title and no reminder", () => {
  const [ev] = birthdayEvents([
    person({ id: "m", name: "Mormor", born: "1926-01-16", died: "2020-02-01" }),
  ]);
  assertEquals(ev.summary, "🕯️ Mormor (birthday)");
  assertEquals(ev.reminders, []);
});

Deno.test("memorialEvents: only for people with a death date", () => {
  const events = memorialEvents([
    person({ id: "a", name: "A", died: "2020-02-01" }),
    person({ id: "b", name: "B", died: null }),
  ]);
  assertEquals(events.length, 1);
  assertEquals(events[0].summary, "🕯️ In memory of A");
  assertEquals(events[0].start, { year: 2020, month: 2, day: 1 });
  assert(events[0].recurring);
});

Deno.test("holidayEvents: explicit per-year occurrences, not recurring", () => {
  const events = holidayEvents(2025, 2025, ["NO"]);
  assert(events.length > 0);
  assert(events.every((e) => e.recurring === false), "holidays must not use RRULE");
  assert(events.some((e) => e.summary.includes("Constitution Day")));
  // Unique UIDs.
  assertEquals(new Set(events.map((e) => e.uid)).size, events.length);
});
