import { HttpError } from "fresh";
import { ADMIN_COOKIE, cookieValue, sessionCookie } from "./auth_cookies.ts";
import { type Viewer, viewerIsActive } from "./model.ts";
import type { Store } from "./store.ts";

export async function adminViewer(request: Request, store: Store): Promise<Viewer | null> {
  const token = cookieValue(request, ADMIN_COOKIE);
  if (!token) return null;
  const viewer = await store.getViewer(token);
  if (!viewer) return null;
  if (!viewerIsActive(viewer)) {
    throw new HttpError(410, "This family access link has expired. Ask for a new one.");
  }
  return viewer.canEdit ? viewer : null;
}

export function adminCookie(token: string): string {
  return sessionCookie(ADMIN_COOKIE, token);
}

export function adminDenied(): never {
  throw new HttpError(404, "Admin access requires a current editor link.");
}
