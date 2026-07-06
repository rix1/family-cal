import { getStore } from "@/lib/db.ts";
import { define } from "@/utils.ts";

// Replaced by vite `define` at build time; plain deno (tests, scripts) has no
// such global, hence the typeof guard.
declare const __DEPLOY_COMMIT__: string | undefined;
const deployCommit = typeof __DEPLOY_COMMIT__ === "string" ? __DEPLOY_COMMIT__ : "dev";

export const handler = define.handlers({
  async GET() {
    try {
      // Cheap single KV read — proves the store opens and the DB file is readable.
      const store = await getStore();
      await store.listGroups();
      // "ok <commit>": deploy verifies the running bundle is the one just built.
      return new Response(`ok ${deployCommit}`, {
        headers: { "content-type": "text/plain" },
      });
    } catch (err) {
      console.error("health check failed", err);
      return new Response("kv unavailable", {
        status: 503,
        headers: { "content-type": "text/plain" },
      });
    }
  },
});
