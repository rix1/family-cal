import { assert, assertEquals, assertThrows } from "jsr:@std/assert";
import { normalizeEvent } from "@/lib/family_events.ts";
import { occasionEvents } from "@/lib/events.ts";
import { ValidationError } from "@/lib/people.ts";
import type { FamilyEvent, Person } from "@/lib/model.ts";
import { SeedStore } from "@/lib/store.ts";
import { calendarViewData } from "@/lib/view_data.ts";

const people: Person[] = [
  { id: "solveig", name: "Solveig", born: "1992-05-13", died: null, groups: ["no"], notes: "" },
  { id: "halvor", name: "Halvor", born: "1990-06-15", died: null, groups: ["no"], notes: "" },
  { id: "pia", name: "Pia", born: "1948-11-14", died: null, groups: ["dk"], notes: "" },
];

const known = new Set(people.map((p) => p.id));

Deno.test("normalizeEvent validates and assigns an id", () => {
  const event = normalizeEvent(
    { kind: "wedding", date: "2018-08-04", subjects: ["solveig", "halvor"] },
    known,
  );
  assertEquals(event.kind, "wedding");
  assertEquals(event.subjects, ["solveig", "halvor"]);
  assert(event.id.startsWith("wedding-solveig-"));

  assertThrows(() => normalizeEvent({ kind: "party", date: "01-01", subjects: ["solveig"] }, known));
  assertThrows(
    () => normalizeEvent({ kind: "wedding", date: "2018-8-4", subjects: ["solveig"] }, known),
    ValidationError,
  );
  assertThrows(
    () => normalizeEvent({ kind: "wedding", date: "2018-08-04", subjects: [] }, known),
    ValidationError,
  );
  assertThrows(
    () => normalizeEvent({ kind: "wedding", date: "2018-08-04", subjects: ["nope"] }, known),
    ValidationError,
  );
});

Deno.test("occasionEvents emits yearly recurring entries with derived titles", () => {
  const event: FamilyEvent = {
    id: "w1",
    kind: "wedding",
    title: "",
    date: "2018-08-04",
    subjects: ["solveig", "halvor"],
    notes: "Lofoten",
  };
  const [cal] = occasionEvents([event], people);
  assertEquals(cal.summary, "💍 Solveig & Halvor (wedding)");
  assertEquals(cal.start, { year: 2018, month: 8, day: 4 });
  assertEquals(cal.recurring, true);
  assertEquals(cal.description, "Lofoten");
});

Deno.test("calendarViewData subsets events by the viewer's groups", async () => {
  const wedding: FamilyEvent = {
    id: "w1",
    kind: "wedding",
    title: "",
    date: "2018-08-04",
    subjects: ["solveig", "halvor"],
    notes: "",
  };
  const store = new SeedStore(
    people,
    [{ key: "no", label: "Norge", flag: "" }, { key: "dk", label: "Danmark", flag: "" }],
    [],
    [],
    [wedding],
  );
  const noView = await calendarViewData(store, ["no"]);
  assertEquals(noView.events.length, 1);
  assertEquals(noView.events[0].title, "Solveig & Halvor");
  assertEquals(noView.events[0].groups, ["no"]);

  const dkView = await calendarViewData(store, ["dk"]);
  assertEquals(dkView.events.length, 0);
});
