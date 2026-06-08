import { ADMIN_COOKIE, clearCookie, VIEWER_COOKIE } from "@/lib/auth_cookies.ts";
import { define } from "@/utils.ts";

export const handler = define.handlers({
  GET() {
    const headers = new Headers({ location: "/" });
    headers.append("set-cookie", clearCookie(VIEWER_COOKIE));
    headers.append("set-cookie", clearCookie(ADMIN_COOKIE));
    return new Response(null, { status: 303, headers });
  },
});
