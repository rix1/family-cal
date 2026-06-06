import type { Store } from "./store.ts";
import type { Viewer } from "./model.ts";

const ADMIN_COOKIE = "family_admin";

function cookieValue(request: Request, name: string): string | null {
  const cookies = request.headers.get("cookie") ?? "";
  for (const part of cookies.split(";")) {
    const [key, ...value] = part.trim().split("=");
    if (key === name) return decodeURIComponent(value.join("="));
  }
  return null;
}

export async function adminViewer(request: Request, store: Store): Promise<Viewer | null> {
  const token = cookieValue(request, ADMIN_COOKIE);
  if (!token) return null;
  const viewer = await store.getViewer(token);
  return viewer?.canEdit ? viewer : null;
}

export function adminCookie(token: string): string {
  return `${ADMIN_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax`;
}

export function adminDenied(): Response {
  return new Response("Admin access required", { status: 404 });
}
