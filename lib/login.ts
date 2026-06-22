/**
 * Magic-link cross-device sign-in. A viewer's session is the capability token in
 * their cookie; to move to a new device they request a link by email, and
 * clicking it rotates that token — issuing a fresh one and expiring every other
 * active link for the same email. One active session per person, by construction.
 *
 * Requesting a link never reveals whether an email is registered (no token, no
 * send, same caller-facing message) to block enumeration.
 */

import { randomToken } from "./access_links.ts";
import type { EmailSender } from "./email.ts";
import { type LoginToken, loginTokenIsActive, type Viewer, viewerIsActive } from "./model.ts";
import { normalizeEmail } from "./newsletter.ts";
import { ValidationError } from "./people.ts";
import type { Store } from "./store.ts";

const LOGIN_TOKEN_TTL_MS = 30 * 60_000;

/** Lowercased, trimmed profile email, or "" when none. */
function viewerEmail(viewer: Viewer): string {
  return (viewer.email ?? "").trim().toLowerCase();
}

/** Normalize, returning null on an invalid email rather than throwing. */
function tryNormalize(rawEmail: unknown): string | null {
  try {
    return normalizeEmail(rawEmail);
  } catch {
    return null;
  }
}

/** The active viewer registered with `rawEmail`, or null. */
export async function findViewerByEmail(store: Store, rawEmail: unknown): Promise<Viewer | null> {
  const email = tryNormalize(rawEmail);
  if (!email) return null;
  const match = (await store.listViewers()).find(
    (viewer) => viewerIsActive(viewer) && viewerEmail(viewer) === email,
  );
  return match ?? null;
}

/** Whether an active viewer (other than `exceptToken`) already uses `rawEmail`. */
export async function emailInUse(
  store: Store,
  rawEmail: unknown,
  exceptToken?: string,
): Promise<boolean> {
  const email = tryNormalize(rawEmail);
  if (!email) return false;
  return (await store.listViewers()).some(
    (viewer) =>
      viewer.token !== exceptToken && viewerIsActive(viewer) && viewerEmail(viewer) === email,
  );
}

export interface LoginRequestResult {
  /**
   * Whether a link was actually sent. For tests and audit only — callers MUST
   * show the same neutral message regardless, to avoid leaking who is registered.
   */
  sent: boolean;
}

/**
 * Mint and email a single-use sign-in link for `rawEmail`, if it belongs to an
 * active viewer. Always resolves; `sent` is false for unknown or malformed
 * emails (no token created, no email sent).
 */
export async function requestLogin(
  store: Store,
  rawEmail: unknown,
  baseUrl: string,
  sender: EmailSender,
  now = new Date(),
): Promise<LoginRequestResult> {
  const email = tryNormalize(rawEmail);
  if (!email) return { sent: false };
  const viewer = await findViewerByEmail(store, email);
  if (!viewer) return { sent: false };

  const loginToken: LoginToken = {
    token: randomToken(),
    email,
    viewerToken: viewer.token,
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + LOGIN_TOKEN_TTL_MS).toISOString(),
  };
  await store.upsertLoginToken(loginToken);

  const link = `${baseUrl.replace(/\/+$/, "")}/auth/login/${loginToken.token}`;
  await sender.send({
    to: email,
    subject: "Your Family Calendar sign-in link",
    text: [
      `Hi ${viewer.name.split(" ")[0] || viewer.name},`,
      "",
      "Open this link to sign in to the Family Calendar on this device:",
      link,
      "",
      "It works once and expires in 30 minutes. Signing in here ends any other",
      "active session, so you may need a new link on your other devices.",
      "",
      "If you didn't ask to sign in, you can safely ignore this email.",
    ].join("\n"),
  });
  await store.appendAudit({
    at: now.toISOString(),
    actor: viewer.name,
    action: "login_request",
    targetId: viewer.token,
    detail: `Sign-in link requested for ${email}`,
  });
  return { sent: true };
}

/**
 * Redeem a sign-in link: rotate the named viewer's token (new one issued, every
 * active link for this email expired) and burn the login token. Returns the new
 * viewer so the route can set its session cookie. Throws `ValidationError` if the
 * link is expired, already used, or the target viewer is gone.
 */
export async function completeLogin(
  store: Store,
  loginToken: LoginToken,
  now = new Date(),
): Promise<Viewer> {
  if (!loginTokenIsActive(loginToken, now)) {
    throw new ValidationError("this sign-in link is invalid or has expired");
  }
  const target = await store.getViewer(loginToken.viewerToken);
  if (!target || !viewerIsActive(target)) {
    throw new ValidationError("this sign-in link is no longer valid");
  }

  // Fresh capability, same identity and preferences (groups, email, newsletter).
  const rotated: Viewer = { ...target, token: randomToken() };
  await store.upsertViewer(rotated);

  // Enforce one active session: expire the old link and any other same-email link.
  const nowIso = now.toISOString();
  for (const other of await store.listViewers()) {
    if (other.token === rotated.token || !viewerIsActive(other)) continue;
    if (viewerEmail(other) === loginToken.email) {
      await store.upsertViewer({ ...other, expiredAt: nowIso });
    }
  }

  await store.upsertLoginToken({ ...loginToken, usedAt: nowIso });
  await store.appendAudit({
    at: nowIso,
    actor: rotated.name,
    action: "login_complete",
    targetId: rotated.token,
    detail: `Signed in via link (rotated from ${target.token})`,
  });
  return rotated;
}
