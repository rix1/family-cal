import { resolveKvPath } from "@/lib/db.ts";
import { KvStore } from "@/lib/kv_store.ts";

function option(name: string): string | undefined {
  const index = Deno.args.indexOf(name);
  return index >= 0 ? Deno.args[index + 1] : undefined;
}

const token = option("--token");
const admin = option("--admin");
if (!token || !["true", "false"].includes(admin ?? "")) {
  console.error('Usage: deno task set-permission --token "..." --admin true|false');
  Deno.exit(1);
}

const store = await KvStore.create(await resolveKvPath());
try {
  const viewer = await store.getViewer(token);
  if (!viewer) {
    console.error("Viewer token not found.");
    Deno.exit(1);
  }
  const updated = await store.upsertViewer({ ...viewer, isAdmin: admin === "true" });
  console.log(`${updated.name}: isAdmin=${updated.isAdmin}`);
} finally {
  store.close();
}
