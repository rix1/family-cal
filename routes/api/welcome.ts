import { getStore } from "@/lib/db.ts";
import { json } from "@/lib/http.ts";
import { setNewsletterPreference } from "@/lib/newsletter.ts";
import { ValidationError } from "@/lib/people.ts";
import { sessionViewer } from "@/lib/viewer_auth.ts";
import { define } from "@/utils.ts";

/**
 * Backs the one-time welcome tour: `subscribe` opts into the monthly email
 * without leaving the tour, `done` records that the tour was finished (or
 * skipped) so it never shows again — on any device, since it lives on the
 * viewer record.
 */
export const handler = define.handlers({
  async POST(ctx) {
    const store = await getStore();
    const viewer = await sessionViewer(ctx.req, store);
    if (!viewer) return json({ error: "sign in with a family access link" }, 404);

    let payload: { action?: string };
    try {
      payload = await ctx.req.json();
    } catch {
      return json({ error: "invalid JSON body" }, 400);
    }

    if (payload.action === "subscribe") {
      try {
        await setNewsletterPreference(store, viewer);
      } catch (err) {
        if (err instanceof ValidationError) return json({ error: err.message }, 400);
        throw err;
      }
      return json({ subscribed: true });
    }
    if (payload.action === "done") {
      if (!viewer.welcomedAt) {
        await store.upsertViewer({ ...viewer, welcomedAt: new Date().toISOString() });
      }
      return json({ done: true });
    }
    return json({ error: "unknown action" }, 400);
  },
});
