import { cookieValue, sessionCookie, VIEWER_COOKIE } from "./auth_cookies.ts";
import { type Viewer, viewerIsActive } from "./model.ts";
import type { Store } from "./store.ts";

/**
 * The active viewer from the session cookie, or null. An expired viewer is
 * treated as signed out — never an error — so `/` and `/login` always render
 * and the holder of a stale cookie can sign in again.
 */
export async function sessionViewer(request: Request, store: Store): Promise<Viewer | null> {
  const token = cookieValue(request, VIEWER_COOKIE);
  if (!token) return null;
  const viewer = await store.getViewer(token);
  if (!viewer || !viewerIsActive(viewer)) return null;
  return viewer;
}

export function viewerCookie(token: string): string {
  return sessionCookie(VIEWER_COOKIE, token);
}
