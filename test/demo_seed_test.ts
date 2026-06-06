import { assert, assertEquals } from "./asserts.ts";
import { loadSeedData } from "../lib/seed.ts";

Deno.test("demo seed covers the main person and access features", () => {
  const { people, viewers } = loadSeedData(`${Deno.cwd()}/seed/demo`);

  assert(people.some((person) => person.born?.length === 5), "partial birthday");
  assert(people.some((person) => person.born === null), "missing birthday");
  assert(people.some((person) => person.died), "deceased relative");
  assert(people.some((person) => person.groups.length > 1), "multiple family groups");
  assert(people.some((person) => person.notes.includes("@")), "@mention");
  assert(people.some((person) => person.notes.includes("[[")), "legacy wiki link");
  assert(people.some((person) => person.name.includes("/")), "name alias");
  assert(viewers.some((viewer) => viewer.canEdit), "editor capability");
  assert(viewers.some((viewer) => viewer.groups.length === 0), "all-family viewer");
  assertEquals(new Set(viewers.map((viewer) => viewer.token)).size, viewers.length);
});
