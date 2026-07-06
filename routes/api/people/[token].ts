import { getStore } from "@/lib/db.ts";
import { NEW_BRANCH_PREFIX, PERSONAL_AFFILIATION, resolveAffiliation } from "@/lib/groups.ts";
import { json } from "@/lib/http.ts";
import { isPersonalGroup, viewerIsActive } from "@/lib/model.ts";
import {
  addPerson,
  applyPeople,
  type PersonInput,
  updatePerson,
  ValidationError,
} from "@/lib/people.ts";
import type { Store } from "@/lib/store.ts";
import { define } from "@/utils.ts";

/**
 * When the form's affiliation sentinel created (or resolved to) a group the
 * client has never seen, describe it in the response so the calendar island
 * can extend its group map, follow-list and filter without a reload.
 */
async function groupForResponse(store: Store, key: string | undefined) {
  if (!key) return undefined;
  const group = (await store.listGroups()).find((g) => g.key === key);
  if (!group) return undefined;
  return {
    key: group.key,
    label: group.label,
    color: group.color,
    ...(isPersonalGroup(group) ? { kind: "personal" as const } : {}),
  };
}

function isAffiliationSentinel(affiliation: string | undefined): boolean {
  return affiliation === PERSONAL_AFFILIATION ||
    Boolean(affiliation?.startsWith(NEW_BRANCH_PREFIX));
}

export const handler = define.handlers({
  // Bulk replacement (the admin editor): it deletes removed people, so unlike
  // PUT/PATCH below it stays admin-only.
  async POST(ctx) {
    const store = await getStore();
    const viewer = await store.getViewer(ctx.params.token);
    if (!viewer) return json({ error: "unknown link" }, 404);
    if (!viewerIsActive(viewer)) return json({ error: "link expired" }, 410);
    if (!viewer.isAdmin) return json({ error: "unknown link" }, 404);

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
  async PUT(ctx) {
    const store = await getStore();
    const viewer = await store.getViewer(ctx.params.token);
    if (!viewer) return json({ error: "unknown link" }, 404);
    if (!viewerIsActive(viewer)) return json({ error: "link expired" }, 410);

    let payload: { person?: PersonInput };
    try {
      payload = await ctx.req.json();
    } catch {
      return json({ error: "invalid JSON body" }, 400);
    }

    try {
      const person = payload.person ?? {};
      // "__personal__" / "__new__:<label>" create the target group first.
      const sentinel = isAffiliationSentinel(person.affiliation);
      person.affiliation = await resolveAffiliation(store, viewer, person.affiliation);
      const saved = await addPerson(store, person, viewer.name);
      return json({
        person: saved,
        group: sentinel ? await groupForResponse(store, person.affiliation) : undefined,
      });
    } catch (err) {
      if (err instanceof ValidationError) return json({ error: err.message }, 400);
      throw err;
    }
  },
  async PATCH(ctx) {
    const store = await getStore();
    const viewer = await store.getViewer(ctx.params.token);
    if (!viewer) return json({ error: "unknown link" }, 404);
    if (!viewerIsActive(viewer)) return json({ error: "link expired" }, 410);

    let payload: { id?: string; person?: PersonInput };
    try {
      payload = await ctx.req.json();
    } catch {
      return json({ error: "invalid JSON body" }, 400);
    }

    if (!payload.id) return json({ error: "person id is required" }, 400);
    try {
      const person = payload.person ?? {};
      const sentinel = isAffiliationSentinel(person.affiliation);
      person.affiliation = await resolveAffiliation(store, viewer, person.affiliation);
      const saved = await updatePerson(store, payload.id, person, viewer.name);
      return json({
        person: saved,
        group: sentinel ? await groupForResponse(store, person.affiliation) : undefined,
      });
    } catch (err) {
      if (err instanceof ValidationError) return json({ error: err.message }, 400);
      throw err;
    }
  },
});
