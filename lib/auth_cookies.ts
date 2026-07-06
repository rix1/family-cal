import { isDev } from "@/lib/env.ts";

export const VIEWER_COOKIE = "family_viewer";
export const ADMIN_COOKIE = "family_admin";

export function cookieValue(request: Request, name: string): string | null {
  const cookies = request.headers.get("cookie") ?? "";
  for (const part of cookies.split(";")) {
    const [key, ...value] = part.trim().split("=");
    if (key === name) return decodeURIComponent(value.join("="));
  }
  return null;
}

/**
 * `; Secure` so the capability token is never sent over plaintext HTTP. Only
 * ENVIRONMENT=DEV drops it, because local dev runs over plain http.
 */
function secureAttr(): string {
  return isDev() ? "" : "; Secure";
}

export function sessionCookie(name: string, token: string): string {
  const year = 60 * 60 * 24 * 365;
  return `${name}=${
    encodeURIComponent(token)
  }; Path=/; HttpOnly; SameSite=Lax${secureAttr()}; Max-Age=${year}`;
}

export function clearCookie(name: string): string {
  return `${name}=; Path=/; HttpOnly; SameSite=Lax${secureAttr()}; Max-Age=0`;
}
