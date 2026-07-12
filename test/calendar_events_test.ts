import { buildRawEvents, filterEvents } from "@/lib/calendar/events.ts";
import type { ViewPerson } from "@/lib/view_data.ts";
import { assertEquals } from "./asserts.ts";

const living: ViewPerson = {
  id: "liv",
  name: "Liv",
  date: "1980-04-02",
  type: "birthday",
  affiliation: "no",
  notes: "",
  died: "",
};

const gone: ViewPerson = {
  id: "gunnar",
  name: "Gunnar",
  date: "1930-06-05",
  type: "birthday",
  affiliation: "no",
  notes: "",
  died: "2010-09-01",
};

Deno.test("filterEvents: the memorial toggle gates deceased birthdays and remembrances", () => {
  const raw = buildRawEvents([living, gone], [], [], 2026, 2026);
  const groups = new Set(["no"]);

  const defaultView = filterEvents(raw, groups, new Set(["birthday"]), "");
  assertEquals(
    defaultView.map((event) => `${event.type}:${event.date}`),
    ["birthday:2026-04-02"],
  );

  const withGone = filterEvents(raw, groups, new Set(["birthday", "memorial"]), "");
  assertEquals(
    withGone.map((event) => `${event.type}:${event.date}`),
    ["birthday:2026-04-02", "birthday:2026-06-05", "memorial:2026-09-01"],
  );
});
