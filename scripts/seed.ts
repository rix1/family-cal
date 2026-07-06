import { resolveKvPath } from "@/lib/db.ts";
import { KvStore } from "@/lib/kv_store.ts";
import { loadSeedData } from "@/lib/seed.ts";

const force = Deno.args.includes("--force");
const seedDir = Deno.args.find((arg) => !arg.startsWith("--")) ?? "seed";
// Seeding is the one flow allowed to create a dev DB from nothing.
const store = await KvStore.create(await resolveKvPath({ createIfMissing: true }));

try {
  const [people, groups, viewers, invites] = await Promise.all([
    store.listPeople(),
    store.listGroups(),
    store.listViewers(),
    store.listInvites(),
  ]);
  const hasData = people.length > 0 || groups.length > 0 || viewers.length > 0 ||
    invites.length > 0;
  if (hasData && !force) {
    console.error("Database is not empty. Re-run with --force to replace its seeded records.");
    Deno.exit(1);
  }

  const seed = loadSeedData(`${Deno.cwd()}/${seedDir}`);
  if (force) {
    for (const person of people) await store.deletePerson(person.id);
    for (const viewer of viewers) await store.deleteViewer(viewer.token);
    for (const invite of invites) await store.deleteInvite(invite.token);
  }
  await store.setGroups(seed.groups);
  for (const person of seed.people) await store.upsertPerson(person);
  for (const viewer of seed.viewers) await store.upsertViewer(viewer);

  console.log(
    `Loaded ${seed.people.length} people, ${seed.groups.length} groups, and ${seed.viewers.length} viewers from ${seedDir}/`,
  );
} finally {
  store.close();
}
