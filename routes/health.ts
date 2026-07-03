import { getStore } from "@/lib/db.ts";
import { define } from "@/utils.ts";

export const handler = define.handlers({
  async GET() {
    try {
      // Cheap single KV read — proves the store opens and the DB file is readable.
      const store = await getStore();
      await store.listGroups();
      return new Response("ok", { headers: { "content-type": "text/plain" } });
    } catch (err) {
      console.error("health check failed", err);
      return new Response("kv unavailable", {
        status: 503,
        headers: { "content-type": "text/plain" },
      });
    }
  },
});
