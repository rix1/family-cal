import { loadSeedData } from "../lib/seed.ts";
import { assert, assertEquals } from "./asserts.ts";

// Guards the tracked demo dataset (seed/demo/) that the README points
// newcomers at: it must stay loadable and internally consistent.
Deno.test("demo seed loads and is internally consistent", () => {
  const { people, groups, viewers } = loadSeedData(`${Deno.cwd()}/seed/demo`);

  assert(groups.length >= 2, "demo needs at least two branches");
  assert(people.length >= 8, "demo needs a family worth browsing");
  assert(viewers.some((v) => v.isAdmin), "demo needs an admin token");

  const keys = new Set(groups.map((g) => g.key));
  for (const p of people) {
    assert(keys.has(p.affiliation), `person ${p.id} references unknown group ${p.affiliation}`);
    assert(
      p.born === null || /^(\d{4}-\d{2}-\d{2}|\d{2}-\d{2})$/.test(p.born),
      `person ${p.id} has a malformed birth date`,
    );
  }
  for (const v of viewers) {
    assert(v.email.includes("@"), `viewer ${v.token} needs an email`);
    for (const g of v.groups) assert(keys.has(g), `viewer ${v.token} follows unknown group ${g}`);
  }

  assertEquals(new Set(people.map((p) => p.id)).size, people.length, "person ids must be unique");
  assertEquals(
    new Set(viewers.map((v) => v.token)).size,
    viewers.length,
    "viewer tokens must be unique",
  );
});
