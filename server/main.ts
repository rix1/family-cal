import { KvStore } from "./src/kv_store.ts";
import { createHandler } from "./src/handler.ts";

if (import.meta.main) {
  const store = await KvStore.create(Deno.env.get("KV_PATH"));
  const handler = createHandler({ store });
  const port = Number(Deno.env.get("PORT") ?? 8000);
  Deno.serve({ port }, handler);
}
