import { getStore } from "@/lib/db.ts";
import { addEvent, type FamilyEventInput } from "@/lib/family_events.ts";
import { json } from "@/lib/http.ts";
import { viewerIsActive } from "@/lib/model.ts";
import { ValidationError } from "@/lib/people.ts";
import { define } from "@/utils.ts";

export const handler = define.handlers({
  async PUT(ctx) {
    const store = await getStore();
    const viewer = await store.getViewer(ctx.params.token);
    if (!viewer) return json({ error: "unknown link" }, 404);
    if (!viewerIsActive(viewer)) return json({ error: "link expired" }, 410);

    let payload: { event?: FamilyEventInput };
    try {
      payload = await ctx.req.json();
    } catch {
      return json({ error: "invalid JSON body" }, 400);
    }

    try {
      return json({ event: await addEvent(store, payload.event ?? {}, viewer.name) });
    } catch (err) {
      if (err instanceof ValidationError) return json({ error: err.message }, 400);
      throw err;
    }
  },
});
