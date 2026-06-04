import { define } from "@/utils.ts";
import { getStore } from "@/lib/db.ts";
import { json } from "@/lib/http.ts";
import { applyPeople, type PersonInput, ValidationError } from "@/lib/people.ts";

export const handler = define.handlers({
  async POST(ctx) {
    let payload: { people?: PersonInput[]; actor?: string };
    try {
      payload = await ctx.req.json();
    } catch {
      return json({ error: "invalid JSON body" }, 400);
    }

    const store = await getStore();
    const actor = (payload.actor ?? "").trim() || "unknown";
    try {
      const people = await applyPeople(store, payload.people ?? [], actor);
      return json({ people });
    } catch (err) {
      if (err instanceof ValidationError) return json({ error: err.message }, 400);
      throw err;
    }
  },
});
