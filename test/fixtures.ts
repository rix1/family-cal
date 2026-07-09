import type { GroupInfo, Person, Viewer } from "../lib/model.ts";
import type { Store } from "../lib/store.ts";

// Fully synthetic, hermetic test data. Tests must never read from seed/ —
// that directory holds the operator's real (untracked) family data, so a
// fresh clone has no seed/people.csv at all.
export const TEST_GROUPS: GroupInfo[] = [
  { key: "no", label: "Family", color: "blue" },
  { key: "dk", label: "Danish family", color: "rose" },
];

export const TEST_PEOPLE: Person[] = [
  { id: "solveig", name: "Solveig", born: "1992-05-13", died: null, affiliation: "no", notes: "" },
  { id: "halvor", name: "Halvor", born: "1990-06-15", died: null, affiliation: "no", notes: "" },
  {
    id: "emil",
    name: "Emil",
    born: "2025-07-19",
    died: null,
    affiliation: "no",
    notes: "sønnen til [[Solveig]] og [[Halvor]]",
  },
  { id: "mette", name: "Mette", born: "1958-03-12", died: null, affiliation: "dk", notes: "" },
  { id: "bedstefar", name: "Henrik", born: "1950-11-02", died: "2020-01-15", affiliation: "dk", notes: "" },
  { id: "ukjent-aar", name: "Ukjent År", born: "06-20", died: null, affiliation: "no", notes: "" },
];
// Groups are an explicit follow-list now (empty = see nobody), so the all-access
// viewers follow every seeded group.
const ALL_GROUPS = TEST_GROUPS.map((group) => group.key);
export const TEST_VIEWERS: Viewer[] = [
  {
    token: "view-all",
    name: "Everyone",
    email: "everyone@example.com",
    groups: ALL_GROUPS,
    isAdmin: false,
  },
  {
    token: "view-dk",
    name: "Danish family",
    email: "dk@example.com",
    groups: ["dk"],
    isAdmin: false,
  },
  {
    token: "admin",
    name: "Family admin",
    email: "admin@example.com",
    groups: ALL_GROUPS,
    isAdmin: true,
  },
];

export async function populateTestStore(store: Store): Promise<void> {
  await store.setGroups(TEST_GROUPS);
  for (const person of TEST_PEOPLE) await store.upsertPerson(person);
  for (const viewer of TEST_VIEWERS) await store.upsertViewer(viewer);
}
