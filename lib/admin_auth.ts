import { HttpError } from "fresh";
import { ADMIN_COOKIE, cookieValue, sessionCookie } from "./auth_cookies.ts";
import { type Viewer, viewerIsActive } from "./model.ts";
import type { Store } from "./store.ts";

/** Like `sessionViewer`, an expired admin cookie means signed out, not an error. */
export async function adminViewer(request: Request, store: Store): Promise<Viewer | null> {
  const token = cookieValue(request, ADMIN_COOKIE);
  if (!token) return null;
  const viewer = await store.getViewer(token);
  if (!viewer || !viewerIsActive(viewer)) return null;
  return viewer.isAdmin ? viewer : null;
}

export function adminCookie(token: string): string {
  return sessionCookie(ADMIN_COOKIE, token);
}

export function adminDenied(): never {
  throw new HttpError(404, "Admin access requires a current admin link.");
}
