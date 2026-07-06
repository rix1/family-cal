import { accessUrls, createViewer, expirePreviousViewerLinks } from "@/lib/access_links.ts";
import { resolveKvPath } from "@/lib/db.ts";
import { KvStore } from "@/lib/kv_store.ts";

function option(name: string): string | undefined {
  const index = Deno.args.indexOf(name);
  return index >= 0 ? Deno.args[index + 1] : undefined;
}

function usage(): never {
  console.error(
    'Usage: deno task issue-link --name "Person" --email who@example.com [--groups no,dk] [--admin] [--prod] [--base-url URL]',
  );
  Deno.exit(1);
}

if (Deno.args.includes("--help")) usage();

// Issuing links is usually a testing action, so this script targets the dev
// database unless --prod says otherwise — overriding whatever .env declares.
const prod = Deno.args.includes("--prod");
Deno.env.set("ENVIRONMENT", prod ? "PROD" : "DEV");

const name = option("--name");
const email = option("--email");
if (!name || !email) usage();

const groups = (option("--groups") ?? "")
  .split(",")
  .map((group) => group.trim())
  .filter(Boolean);
// In dev, .env's BASE_URL is the production origin — print links that actually
// hit the dev server instead.
const baseUrl = option("--base-url") ??
  (prod ? Deno.env.get("BASE_URL") ?? "http://localhost:8000" : "http://localhost:3000");
const viewer = createViewer({
  name,
  email,
  groups,
  isAdmin: Deno.args.includes("--admin"),
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
  console.log(`Issued ${prod ? "PROD" : "dev"} access for ${viewer.name}`);
  if (matchingViewers.length) {
    console.log(`Expired ${matchingViewers.length} previous link(s) for ${viewer.name}`);
  }
  console.log(`Calendar: ${urls.calendar}`);
  console.log(`iCal: ${urls.ical}`);
  if (urls.admin) console.log(`Admin: ${urls.admin}`);
} finally {
  store.close();
}
