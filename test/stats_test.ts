import { familyStats } from "../lib/stats.ts";
import type { NewsletterPreference, Person, Viewer } from "../lib/model.ts";
import { assertEquals } from "./asserts.ts";

function person(p: Partial<Person> & { name: string }): Person {
  return {
    id: p.id ?? p.name.toLowerCase(),
    name: p.name,
    born: p.born ?? null,
    died: p.died ?? null,
    groups: p.groups ?? [],
    notes: p.notes ?? "",
  };
}

const newsletter: NewsletterPreference = {
  email: "a@b.no",
  groups: [],
  subscribedAt: "2026-01-01",
  updatedAt: "2026-01-01",
};

function viewer(v: Partial<Viewer> & { name: string }): Viewer {
  return {
    token: v.token ?? v.name.toLowerCase(),
    name: v.name,
    groups: v.groups ?? [],
    canEdit: v.canEdit ?? false,
    expiredAt: v.expiredAt,
    newsletter: v.newsletter,
  };
}

Deno.test("familyStats derives ages, range and busiest month from full birthdays", () => {
  const people = [
    person({ name: "Olav", born: "1940-07-02" }), // 85
    person({ name: "Emil", born: "2025-07-19" }), // 0
    person({ name: "Solveig", born: "1992-05-13" }), // 34
    person({ name: "Ada", born: "07-12" }), // month known, year unknown
    person({ name: "Ghost", born: "1900-01-01", died: "1980-01-01" }), // deceased, excluded from ages
    person({ name: "Unknown" }), // no date at all
  ];
  const stats = familyStats(people, [], "2026-06-21");

  assertEquals(stats.totalPeople, 6);
  assertEquals(stats.living, 5);
  assertEquals(stats.inMemory, 1);
  assertEquals(stats.birthDatesKnown, 4); // four full YYYY-MM-DD dates
  assertEquals(stats.averageAge, 40); // (85 + 34 + 0) / 3 = 39.67 -> 40
  assertEquals(stats.oldest, { name: "Olav", age: 85 });
  assertEquals(stats.youngest, { name: "Emil", age: 0 });
  // July: Olav, Emil, Ada = 3; May: Solveig = 1; Jan: Ghost = 1.
  assertEquals(stats.busiestMonth, { month: 7, count: 3 });
  assertEquals(stats.twins, []); // every living member has a distinct age
});

Deno.test("familyStats groups living members who share an age", () => {
  const people = [
    person({ name: "Mia", born: "1990-02-10" }), // 36
    person({ name: "Leo", born: "1990-11-30" }), // 35 (birthday later in year)
    person({ name: "Ada", born: "1990-01-05" }), // 36
    person({ name: "Eli", born: "2000-03-03" }), // 26
    person({ name: "Ola", born: "2000-04-04" }), // 26
    person({ name: "Old", born: "1990-01-01", died: "2020-01-01" }), // deceased, ignored
  ];
  const stats = familyStats(people, [], "2026-06-21");

  // Oldest age first; names alphabetical within a group; singles excluded.
  assertEquals(stats.twins, [
    { age: 36, names: ["Ada", "Mia"] },
    { age: 26, names: ["Eli", "Ola"] },
  ]);
});

Deno.test("familyStats counts active subscribers and viewers", () => {
  const viewers = [
    viewer({ name: "A", newsletter }),
    viewer({ name: "B", newsletter, expiredAt: "2026-01-01" }), // expired: not active, not a subscriber
    viewer({ name: "C" }), // active but not subscribed
  ];
  const stats = familyStats([], viewers, "2026-06-21");

  assertEquals(stats.subscribers, 1);
  assertEquals(stats.activeViewers, 2);
  assertEquals(stats.averageAge, null);
  assertEquals(stats.oldest, null);
  assertEquals(stats.busiestMonth, null);
  assertEquals(stats.twins, []);
});
