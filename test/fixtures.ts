import { loadSeedData } from "../lib/seed.ts";
import type { Viewer } from "../lib/model.ts";
import type { Store } from "../lib/store.ts";

const seed = loadSeedData(`${Deno.cwd()}/seed`);

export const TEST_PEOPLE = seed.people;
export const TEST_GROUPS = seed.groups;
export const TEST_VIEWERS: Viewer[] = [
  { token: "view-all", name: "Everyone", groups: [], canEdit: false },
  { token: "view-dk", name: "Danish family", groups: ["dk"], canEdit: false },
  { token: "editor", name: "Family editor", groups: [], canEdit: true },
];

export async function populateTestStore(store: Store): Promise<void> {
  await store.setGroups(TEST_GROUPS);
  for (const person of TEST_PEOPLE) await store.upsertPerson(person);
  for (const viewer of TEST_VIEWERS) await store.upsertViewer(viewer);
}
