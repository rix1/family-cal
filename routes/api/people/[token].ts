import { getStore } from "@/lib/db.ts";
import { json } from "@/lib/http.ts";
import { viewerIsActive } from "@/lib/model.ts";
import { applyPeople, type PersonInput, updatePerson, ValidationError } from "@/lib/people.ts";
import { define } from "@/utils.ts";

export const handler = define.handlers({
  async POST(ctx) {
    const store = await getStore();
    const viewer = await store.getViewer(ctx.params.token);
    if (!viewer) return json({ error: "unknown editor link" }, 404);
    if (!viewerIsActive(viewer)) return json({ error: "editor link expired" }, 410);
    if (!viewer.canEdit) return json({ error: "unknown editor link" }, 404);

    let payload: { people?: PersonInput[] };
    try {
      payload = await ctx.req.json();
    } catch {
      return json({ error: "invalid JSON body" }, 400);
    }

    try {
      const people = await applyPeople(store, payload.people ?? [], viewer.name);
      return json({ people });
    } catch (err) {
      if (err instanceof ValidationError) return json({ error: err.message }, 400);
      throw err;
    }
  },
  async PATCH(ctx) {
    const store = await getStore();
    const viewer = await store.getViewer(ctx.params.token);
    if (!viewer) return json({ error: "unknown editor link" }, 404);
    if (!viewerIsActive(viewer)) return json({ error: "editor link expired" }, 410);
    if (!viewer.canEdit) return json({ error: "unknown editor link" }, 404);

    let payload: { id?: string; person?: PersonInput };
    try {
      payload = await ctx.req.json();
    } catch {
      return json({ error: "invalid JSON body" }, 400);
    }

    if (!payload.id) return json({ error: "person id is required" }, 400);
    try {
      return json({
        person: await updatePerson(store, payload.id, payload.person ?? {}, viewer.name),
      });
    } catch (err) {
      if (err instanceof ValidationError) return json({ error: err.message }, 400);
      throw err;
    }
  },
});
