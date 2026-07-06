import { loadSeedData } from "../lib/seed.ts";
import type { Viewer } from "../lib/model.ts";
import type { Store } from "../lib/store.ts";

const seed = loadSeedData(`${Deno.cwd()}/seed`);

export const TEST_PEOPLE = seed.people;
export const TEST_GROUPS = seed.groups;
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
