/**
 * Personal groups and member-created branches (docs/personal-groups.md).
 *
 * The add-person form submits `affiliation` either as a real group key or as
 * one of two sentinels resolved here, server-side, before the person is
 * validated: `__personal__` files the person under the viewer's own list
 * ("Mine folk", created unlisted on first use), and `__new__:<label>` creates
 * a new branch anyone can follow. Creating either auto-follows the creator —
 * you should always see what you just added.
 */

import { slug } from "./dates.ts";
import { nextFreeColor, PERSONAL_GROUP_COLOR } from "./group_colors.ts";
import { type GroupInfo, isPersonalGroup, type Viewer } from "./model.ts";
import { ValidationError } from "./people.ts";
import type { Store } from "./store.ts";

export const PERSONAL_AFFILIATION = "__personal__";
export const NEW_BRANCH_PREFIX = "__new__:";

/** The viewer's own list, if they created one. Ownership is by profile email. */
export function ownPersonalGroup(groups: GroupInfo[], email: string): GroupInfo | undefined {
  return groups.find((group) => isPersonalGroup(group) && group.owner === email);
}

/** "Halvor" → "Halvors folk"; names already ending in s get an apostrophe. */
function personalLabel(viewerName: string): string {
  const first = viewerName.trim().split(/\s+/)[0] || viewerName.trim();
  return /s$/i.test(first) ? `${first}' folk` : `${first}s folk`;
}

function followGroup(store: Store, viewer: Viewer, key: string): Promise<Viewer> {
  if (viewer.groups.includes(key)) return Promise.resolve(viewer);
  return store.upsertViewer({ ...viewer, groups: [...viewer.groups, key].sort() });
}

/** The viewer's own list, created (unlisted) on first use. */
export async function ensurePersonalGroup(store: Store, viewer: Viewer): Promise<GroupInfo> {
  const groups = await store.listGroups();
  const existing = ownPersonalGroup(groups, viewer.email);
  if (existing) return existing;
  const group: GroupInfo = {
    key: `list-${slug(viewer.email)}`,
    label: personalLabel(viewer.name),
    color: PERSONAL_GROUP_COLOR.key,
    kind: "personal",
    owner: viewer.email,
    listed: false,
  };
  if (groups.some((g) => g.key === group.key)) {
    // Same email slug but different owner email can't happen (emails are
    // unique per active viewer), so a collision means a branch squatted the
    // key — refuse rather than silently merging worlds.
    throw new ValidationError(`group key "${group.key}" already exists`);
  }
  await store.setGroups([...groups, group]);
  await followGroup(store, viewer, group.key);
  await store.appendAudit({
    at: new Date().toISOString(),
    actor: viewer.name,
    action: "create_list",
    detail: `Created personal list "${group.label}"`,
    groups: [group.key],
  });
  return group;
}

/**
 * A member-created branch. A label matching an existing branch (case- and
 * slug-insensitively) resolves to that branch instead of erroring — the
 * server-side twin of the typeahead's near-match suggestion.
 */
export async function ensureBranch(
  store: Store,
  viewer: Viewer,
  label: string,
): Promise<GroupInfo> {
  const trimmed = label.trim();
  if (!trimmed) throw new ValidationError("new branch needs a name");
  const groups = await store.listGroups();
  const key = slug(trimmed);
  const existing = groups.find(
    (group) =>
      !isPersonalGroup(group) &&
      (group.key === key ||
        group.label.toLocaleLowerCase("nb") === trimmed.toLocaleLowerCase("nb")),
  );
  if (existing) {
    await followGroup(store, viewer, existing.key);
    return existing;
  }
  if (groups.some((group) => group.key === key)) {
    throw new ValidationError(`group key "${key}" already exists`);
  }
  const group: GroupInfo = {
    key,
    label: trimmed,
    color: nextFreeColor(groups.filter((g) => !isPersonalGroup(g)).map((g) => g.color)),
  };
  await store.setGroups([...groups, group]);
  await followGroup(store, viewer, group.key);
  await store.appendAudit({
    at: new Date().toISOString(),
    actor: viewer.name,
    action: "create_group",
    detail: `Created branch "${group.label}"`,
    groups: [group.key],
  });
  return group;
}

/**
 * Turn the add-person form's affiliation into a real group key, creating the
 * personal list or a new branch when a sentinel asks for it.
 */
export async function resolveAffiliation(
  store: Store,
  viewer: Viewer,
  affiliation: string | undefined,
): Promise<string | undefined> {
  if (affiliation === PERSONAL_AFFILIATION) {
    return (await ensurePersonalGroup(store, viewer)).key;
  }
  if (affiliation?.startsWith(NEW_BRANCH_PREFIX)) {
    return (await ensureBranch(store, viewer, affiliation.slice(NEW_BRANCH_PREFIX.length))).key;
  }
  return affiliation;
}

/**
 * The groups a viewer may see named anywhere (pickers, calendar filter):
 * branches, their own lists, and lists others have shared. Other people's
 * unlisted lists stay invisible even if a stale follow-list references one.
 */
export function visibleGroups(groups: GroupInfo[], viewerEmail: string): GroupInfo[] {
  return groups.filter(
    (group) => !isPersonalGroup(group) || group.listed || group.owner === viewerEmail,
  );
}
