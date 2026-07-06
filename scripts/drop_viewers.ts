/**
 * One-off reset for the canEdit → isAdmin migration: deletes every viewer
 * record so no legacy `canEdit` shapes remain in KV. Everyone (including you)
 * loses access; re-issue links with `deno task issue-link` or fresh invites.
 * Note this also wipes feed tokens and newsletter opt-ins, which live on the
 * viewer records.
 */

import { resolveKvPath } from "@/lib/db.ts";
import { KvStore } from "@/lib/kv_store.ts";

const store = await KvStore.create(await resolveKvPath());
try {
  const viewers = await store.listViewers();
  if (!Deno.args.includes("--yes")) {
    console.error(`Would delete ${viewers.length} viewer(s). Re-run with --yes to do it.`);
    Deno.exit(1);
  }
  for (const viewer of viewers) {
    await store.deleteViewer(viewer.token);
    console.log(`Deleted ${viewer.name} (${viewer.token})`);
  }
  console.log(`Deleted ${viewers.length} viewer(s).`);
} finally {
  store.close();
}
