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
];

const knownGroups = new Set(["no", "dk"]);

Deno.test("normalizeEvent validates and assigns an id", () => {
  const event = normalizeEvent(
    {
      kind: "wedding",
      title: "Bryllupsdag",
      date: "2018-08-04",
      groups: ["no", "dk"],
      notes: "@solveig og @halvor giftet seg på Hamar!",
    },
    knownGroups,
  );
  assertEquals(event.kind, "wedding");
  assertEquals(event.groups, ["no", "dk"]);
  assert(event.id.startsWith("wedding-bryllupsdag-"));

  assertThrows(
    () => normalizeEvent({ kind: "party", title: "x", date: "01-01", groups: ["no"] }, knownGroups),
    ValidationError,
  );
  assertThrows(
    () =>
      normalizeEvent(
        { kind: "wedding", title: "", date: "2018-08-04", groups: ["no"] },
        knownGroups,
      ),
    ValidationError,
  );
  assertThrows(
    () =>
      normalizeEvent(
        { kind: "wedding", title: "x", date: "2018-8-4", groups: ["no"] },
        knownGroups,
      ),
    ValidationError,
  );
  assertThrows(
    () =>
      normalizeEvent({ kind: "wedding", title: "x", date: "2018-08-04", groups: [] }, knownGroups),
    ValidationError,
  );
  assertThrows(
    () =>
      normalizeEvent(
        { kind: "wedding", title: "x", date: "2018-08-04", groups: ["nope"] },
        knownGroups,
      ),
    ValidationError,
  );
});

Deno.test("occasionEvents emits yearly recurring entries", () => {
  const event: FamilyEvent = {
    id: "w1",
    kind: "wedding",
    title: "Solveig & Halvor",
    date: "2018-08-04",
    groups: ["no"],
    notes: "Lofoten",
  };
  const [cal] = occasionEvents([event]);
  assertEquals(cal.summary, "💍 Solveig & Halvor (wedding)");
  assertEquals(cal.start, { year: 2018, month: 8, day: 4 });
  assertEquals(cal.recurring, true);
  assertEquals(cal.description, "Lofoten");
});

Deno.test("calendarViewData subsets events by the viewer's groups", async () => {
  const wedding: FamilyEvent = {
    id: "w1",
    kind: "wedding",
    title: "Bryllupsdag",
    date: "2018-08-04",
    groups: ["no"],
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
  assertEquals(noView.events[0].title, "Bryllupsdag");

  const dkView = await calendarViewData(store, ["dk"]);
  assertEquals(dkView.events.length, 0);

  const allView = await calendarViewData(store);
  assertEquals(allView.events.length, 1);
});
