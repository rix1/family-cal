import { ADMIN_COOKIE, clearCookie, VIEWER_COOKIE } from "@/lib/auth_cookies.ts";
import { define } from "@/utils.ts";

/** Clear both sessions and redirect home. POST-only so a cross-site GET can't force logout. */
function logout(): Response {
  const headers = new Headers({ location: "/" });
  headers.append("set-cookie", clearCookie(VIEWER_COOKIE));
  headers.append("set-cookie", clearCookie(ADMIN_COOKIE));
  return new Response(null, { status: 303, headers });
}

export const handler = define.handlers({
  POST() {
    return logout();
  },
});
