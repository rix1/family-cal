import { SeedStore } from "./src/store.ts";
import { createHandler } from "./src/handler.ts";

const handler = createHandler(new SeedStore());
const port = Number(Deno.env.get("PORT") ?? 8000);

if (import.meta.main) {
  Deno.serve({ port }, handler);
}
