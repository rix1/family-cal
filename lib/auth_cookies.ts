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
 * `; Secure` so the capability token is never sent over plaintext HTTP. Opt out
 * with DEV_INSECURE_COOKIES=1 for local http development only.
 */
function secureAttr(): string {
  return Deno.env.get("DEV_INSECURE_COOKIES") === "1" ? "" : "; Secure";
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
