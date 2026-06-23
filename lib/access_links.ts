import { type Viewer, viewerIsActive } from "./model.ts";
import { ValidationError } from "./people.ts";
import type { Store } from "./store.ts";

export interface AccessLinkOptions {
  name: string;
  groups: string[];
  canEdit: boolean;
  token?: string;
  /** Profile email for magic-link login; omitted for admin-issued links. */
  email?: string;
}

export function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return encodeBase64Url(bytes);
}

function encodeBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

export function createViewer(options: AccessLinkOptions): Viewer {
  const name = options.name.trim();
  if (!name) throw new Error("--name is required");
  const viewer: Viewer = {
    token: options.token ?? randomToken(),
    name,
    groups: options.groups,
    canEdit: options.canEdit,
    feedToken: randomToken(),
  };
  if (options.email) viewer.email = options.email;
  return viewer;
}

/**
 * The viewer's feed token, generating and persisting one if missing. Use before
 * showing or serving the iCal subscription URL.
 */
export async function ensureFeedToken(store: Store, viewer: Viewer): Promise<string> {
  if (viewer.feedToken) return viewer.feedToken;
  const feedToken = randomToken();
  await store.upsertViewer({ ...viewer, feedToken });
  return feedToken;
}

/**
 * Self-serve update of the groups a viewer follows. Drives the calendar, the
 * iCal feed and the email audience at once. Empty list = follow nothing.
 */
export async function setViewerGroups(
  store: Store,
  viewer: Viewer,
  groups: string[],
): Promise<Viewer> {
  const known = new Set((await store.listGroups()).map((group) => group.key));
  const next = [...new Set(groups.map((group) => group.trim()).filter(Boolean))].sort();
  for (const group of next) {
    if (!known.has(group)) throw new ValidationError(`unknown group "${group}"`);
  }
  const updated: Viewer = { ...viewer, groups: next };
  await store.upsertViewer(updated);
  await store.appendAudit({
    at: new Date().toISOString(),
    actor: viewer.name,
    action: "viewer_groups",
    detail: `Following: ${next.join(", ") || "none"}`,
  });
  return updated;
}

/** The active viewer that owns `feedToken`, or null. */
export async function viewerByFeedToken(store: Store, feedToken: string): Promise<Viewer | null> {
  if (!feedToken) return null;
  const match = (await store.listViewers()).find(
    (viewer) => viewer.feedToken === feedToken && viewerIsActive(viewer),
  );
  return match ?? null;
}

export function accessUrls(viewer: Viewer, baseUrl: string) {
  const base = baseUrl.replace(/\/+$/, "");
  return {
    calendar: `${base}/view/${viewer.token}`,
    editor: viewer.canEdit ? `${base}/admin/?token=${viewer.token}` : null,
    // Feed token, not the session token, so the subscription survives rotation.
    ical: `${base}/cal/${viewer.feedToken ?? viewer.token}.ics`,
  };
}

export async function expirePreviousViewerLinks(
  store: Store,
  viewer: Viewer,
  expiredAt = new Date().toISOString(),
): Promise<Viewer[]> {
  const matching = (await store.listViewers()).filter((existing) =>
    existing.token !== viewer.token &&
    viewerIsActive(existing) &&
    existing.name.trim().toLocaleLowerCase() === viewer.name.trim().toLocaleLowerCase()
  );
  // Rotation must not silently unsubscribe: carry the most recently updated
  // newsletter preference over to the replacement link.
  const inherited = matching
    .map((existing) => existing.newsletter)
    .filter((pref) => pref !== undefined)
    .sort((a, b) => b!.updatedAt.localeCompare(a!.updatedAt))[0];
  if (inherited && !viewer.newsletter) viewer.newsletter = inherited;
  // Likewise carry the login email forward so re-issued links stay sign-in-able.
  if (!viewer.email) {
    const inheritedEmail = matching.find((existing) => existing.email)?.email;
    if (inheritedEmail) viewer.email = inheritedEmail;
  }
  // Carry the feed token too, so an existing calendar subscription keeps working.
  const inheritedFeedToken = matching.find((existing) => existing.feedToken)?.feedToken;
  if (inheritedFeedToken) viewer.feedToken = inheritedFeedToken;
  for (const existing of matching) {
    await store.upsertViewer({ ...existing, expiredAt });
  }
  return matching;
}
