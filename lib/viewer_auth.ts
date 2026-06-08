import { HttpError } from "fresh";
import { cookieValue, sessionCookie, VIEWER_COOKIE } from "./auth_cookies.ts";
import { type Viewer, viewerIsActive } from "./model.ts";
import type { Store } from "./store.ts";

export async function sessionViewer(request: Request, store: Store): Promise<Viewer | null> {
  const token = cookieValue(request, VIEWER_COOKIE);
  if (!token) return null;
  const viewer = await store.getViewer(token);
  if (!viewer) return null;
  if (!viewerIsActive(viewer)) {
    throw new HttpError(410, "This family access link has expired. Ask for a new one.");
  }
  return viewer;
}

export function viewerCookie(token: string): string {
  return sessionCookie(VIEWER_COOKIE, token);
}
