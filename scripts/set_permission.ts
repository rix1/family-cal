import { KvStore } from "@/lib/kv_store.ts";

function option(name: string): string | undefined {
  const index = Deno.args.indexOf(name);
  return index >= 0 ? Deno.args[index + 1] : undefined;
}

const token = option("--token");
const edit = option("--edit");
if (!token || !["true", "false"].includes(edit ?? "")) {
  console.error('Usage: deno task set-permission --token "..." --edit true|false');
  Deno.exit(1);
}

const store = await KvStore.create(Deno.env.get("KV_PATH"));
try {
  const viewer = await store.getViewer(token);
  if (!viewer) {
    console.error("Viewer token not found.");
    Deno.exit(1);
  }
  const updated = await store.upsertViewer({ ...viewer, canEdit: edit === "true" });
  console.log(`${updated.name}: canEdit=${updated.canEdit}`);
} finally {
  store.close();
}
