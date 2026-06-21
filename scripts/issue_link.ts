import { accessUrls, createViewer, expirePreviousViewerLinks } from "@/lib/access_links.ts";
import { resolveKvPath } from "@/lib/db.ts";
import { KvStore } from "@/lib/kv_store.ts";

function option(name: string): string | undefined {
  const index = Deno.args.indexOf(name);
  return index >= 0 ? Deno.args[index + 1] : undefined;
}

function usage(): never {
  console.error(
    'Usage: deno task issue-link --name "Person" [--groups no,dk] [--edit] [--base-url URL]',
  );
  Deno.exit(1);
}

if (Deno.args.includes("--help")) usage();

const name = option("--name");
if (!name) usage();

const groups = (option("--groups") ?? "")
  .split(",")
  .map((group) => group.trim())
  .filter(Boolean);
const baseUrl = option("--base-url") ?? Deno.env.get("BASE_URL") ?? "http://localhost:8000";
const viewer = createViewer({
  name,
  groups,
  canEdit: Deno.args.includes("--edit"),
});

const store = await KvStore.create(await resolveKvPath());
try {
  const knownGroups = new Set((await store.listGroups()).map((group) => group.key));
  const invalidGroups = groups.filter((group) => !knownGroups.has(group));
  if (invalidGroups.length) {
    console.error(`Unknown groups: ${invalidGroups.join(", ")}`);
    Deno.exit(1);
  }

  const matchingViewers = await expirePreviousViewerLinks(store, viewer);
  await store.upsertViewer(viewer);
  const urls = accessUrls(viewer, baseUrl);
  console.log(`Issued access for ${viewer.name}`);
  if (matchingViewers.length) {
    console.log(`Expired ${matchingViewers.length} previous link(s) for ${viewer.name}`);
  }
  console.log(`Calendar: ${urls.calendar}`);
  console.log(`iCal: ${urls.ical}`);
  if (urls.editor) console.log(`Editor: ${urls.editor}`);
} finally {
  store.close();
}
