import { buildFeed } from "../lib/feed.ts";
import { SeedStore } from "../lib/store.ts";
import { assert, assertEquals, assertStringIncludes } from "./asserts.ts";
import { TEST_GROUPS, TEST_PEOPLE, TEST_VIEWERS } from "./fixtures.ts";

const fixedNow = new Date(Date.UTC(2026, 5, 1));
const fixedStamp = new Date(Date.UTC(2026, 5, 1, 0, 0, 0));

Deno.test("buildFeed produces a well-formed calendar from the seed store", async () => {
  const ics = await buildFeed(new SeedStore(TEST_PEOPLE, TEST_GROUPS, TEST_VIEWERS), {
    now: fixedNow,
    dtstamp: fixedStamp,
  });

  assertStringIncludes(ics, "BEGIN:VCALENDAR");
  assertStringIncludes(ics, "X-WR-CALNAME:Family Calendar");
  assert(!/[^\r]\n/.test(ics), "all newlines must be CRLF");

  // One recurring birthday per dated person, plus one recurring death
  // anniversary per remembered person.
  const datedPeople = TEST_PEOPLE.filter((p) => p.born).length;
  const remembered = TEST_PEOPLE.filter((p) => p.died).length;
  const rrules = (ics.match(/RRULE:FREQ=YEARLY/g) ?? []).length;
  assertEquals(rrules, datedPeople + remembered);

  // Balanced VEVENT blocks.
  const begin = (ics.match(/BEGIN:VEVENT/g) ?? []).length;
  const end = (ics.match(/END:VEVENT/g) ?? []).length;
  assertEquals(begin, end);

  // A known seeded birthday and a computed holiday are both present.
  assertStringIncludes(ics, "🎂 Åse / Mamma");
  assertStringIncludes(ics, "Constitution Day"); // May 17, computed
});

Deno.test("buildFeed group filter subsets people (the per-viewer seam)", async () => {
  const dkOnly = await buildFeed(new SeedStore(TEST_PEOPLE, TEST_GROUPS, TEST_VIEWERS), {
    groups: ["dk"],
    now: fixedNow,
    dtstamp: fixedStamp,
  });
  assertStringIncludes(dkOnly, "🎂 Mette Dahl"); // DK person present
  assert(!dkOnly.includes("🎂 Åse / Mamma"), "NO person should be excluded");

  // Holidays are independent of the people filter.
  assertStringIncludes(dkOnly, "Christmas Day");
});

Deno.test("buildFeed holiday window scales with past/future years", async () => {
  const wide = await buildFeed(new SeedStore(TEST_PEOPLE, TEST_GROUPS, TEST_VIEWERS), {
    now: fixedNow,
    dtstamp: fixedStamp,
    pastYears: 0,
    futureYears: 0,
  });
  // Only 2026 holidays in a single-year window: New Year's Day appears once.
  assertEquals((wide.match(/New Year's Day/g) ?? []).length, 1);
});
