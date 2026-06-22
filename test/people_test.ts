import {
  addPerson,
  applyPeople,
  normalizePerson,
  updatePerson,
  ValidationError,
} from "../lib/people.ts";
import { SeedStore } from "../lib/store.ts";
import { assert, assertEquals } from "./asserts.ts";
import { TEST_GROUPS, TEST_PEOPLE, TEST_VIEWERS } from "./fixtures.ts";

const groups = new Set(["no", "dk"]);

Deno.test("normalizePerson trims, drops unknown groups, assigns an id", () => {
  const p = normalizePerson(
    { name: "  Bob ", born: "1990-01-02", groups: ["no", "bogus"], notes: " hey " },
    groups,
  );
  assertEquals(p.name, "Bob");
  assertEquals(p.born, "1990-01-02");
  assertEquals(p.groups, ["no"]);
  assertEquals(p.notes, "hey");
  assert(p.id.startsWith("bob-"));
});

Deno.test("normalizePerson accepts MM-DD and empty dates", () => {
  assertEquals(normalizePerson({ name: "A", born: "03-30" }, groups).born, "03-30");
  assertEquals(normalizePerson({ name: "B", born: "" }, groups).born, null);
  assertEquals(normalizePerson({ name: "C" }, groups).born, null);
});

Deno.test("normalizePerson rejects bad dates and empty names", () => {
  let threw = false;
  try {
    normalizePerson({ name: "X", born: "not-a-date" }, groups);
  } catch (e) {
    threw = e instanceof ValidationError;
  }
  assert(threw, "expected ValidationError for bad born date");

  threw = false;
  try {
    normalizePerson({ name: "  ", born: "1990-01-01" }, groups);
  } catch (e) {
    threw = e instanceof ValidationError;
  }
  assert(threw, "expected ValidationError for empty name");
});

Deno.test("normalizePerson rejects MM-DD as a death date", () => {
  let threw = false;
  try {
    normalizePerson({ name: "X", died: "01-02" }, groups);
  } catch (e) {
    threw = e instanceof ValidationError;
  }
  assert(threw, "death date must be a full date");
});

Deno.test("applyPeople performs a full replace with audit", async () => {
  const store = new SeedStore(TEST_PEOPLE, TEST_GROUPS, TEST_VIEWERS);
  const before = (await store.listPeople()).length;
  assert(before > 2);

  const result = await applyPeople(
    store,
    [
      { id: "solveig", name: "Solveig", born: "1992-05-13", groups: ["no"] },
      { name: "New Person", born: "2001-02-03", groups: ["dk"] },
    ],
    "Tester",
  );
  assertEquals(result.length, 2);

  const audit = await store.listAudit();
  // deletes for everyone removed + create for the new person.
  assert(audit.some((a) => a.action === "create" && a.detail === "New Person"));
  assert(audit.filter((a) => a.action === "delete").length === before - 1);
  assert(audit.every((a) => a.actor === "Tester"));
});

Deno.test("applyPeople rejects duplicate ids", async () => {
  const store = new SeedStore(TEST_PEOPLE, TEST_GROUPS, TEST_VIEWERS);
  let threw = false;
  try {
    await applyPeople(
      store,
      [{ id: "dup", name: "A" }, { id: "dup", name: "B" }],
      "x",
    );
  } catch (e) {
    threw = e instanceof ValidationError;
  }
  assert(threw, "expected ValidationError for duplicate ids");
});

Deno.test("addPerson creates one person, assigns an id, and audits a create", async () => {
  const store = new SeedStore(TEST_PEOPLE, TEST_GROUPS, TEST_VIEWERS);
  const before = (await store.listPeople()).length;

  const created = await addPerson(
    store,
    { name: "Fresh Face", born: "2003-04-05", groups: ["no", "bogus"], notes: "@solveig" },
    "Editor",
  );

  assert(created.id.startsWith("fresh-face-"));
  assertEquals(created.groups, ["no"]); // unknown group dropped
  assertEquals((await store.listPeople()).length, before + 1);
  assert(
    (await store.listAudit()).some((a) =>
      a.action === "create" && a.targetId === created.id && a.actor === "Editor"
    ),
  );
});

Deno.test("addPerson rejects a duplicate id and an empty name", async () => {
  const store = new SeedStore(TEST_PEOPLE, TEST_GROUPS, TEST_VIEWERS);
  let threw = false;
  try {
    await addPerson(store, { id: "solveig", name: "Clash" }, "x");
  } catch (e) {
    threw = e instanceof ValidationError;
  }
  assert(threw, "expected ValidationError for a colliding id");

  threw = false;
  try {
    await addPerson(store, { name: "  " }, "x");
  } catch (e) {
    threw = e instanceof ValidationError;
  }
  assert(threw, "expected ValidationError for an empty name");
});

Deno.test("updatePerson changes one person and audits the editor", async () => {
  const store = new SeedStore(TEST_PEOPLE, TEST_GROUPS, TEST_VIEWERS);
  const before = (await store.listPeople()).length;
  const updated = await updatePerson(
    store,
    "solveig",
    {
      name: "Solveig Updated",
      born: "1992-05-13",
      died: null,
      groups: ["no", "dk"],
      notes: "Mother of @emil",
    },
    "Editor",
  );
  assertEquals(updated.name, "Solveig Updated");
  assertEquals((await store.listPeople()).length, before);
  assertEquals((await store.getPerson("solveig"))?.groups, ["no", "dk"]);
  assert((await store.listAudit()).some((entry) => entry.targetId === "solveig"));
});
