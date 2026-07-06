import { adminCookie } from "@/lib/admin_auth.ts";
import { getStore } from "@/lib/db.ts";
import { t } from "@/lib/i18n.ts";
import { completeLogin } from "@/lib/login.ts";
import { ValidationError } from "@/lib/people.ts";
import { viewerCookie } from "@/lib/viewer_auth.ts";
import { define } from "@/utils.ts";
import { HttpError } from "fresh";

export const handlers = define.handlers({
  async GET(ctx) {
    const store = await getStore();
    const loginToken = await store.getLoginToken(ctx.params.token);
    if (!loginToken) throw new HttpError(404, t("login.error.linkNotFound"));

    let viewer;
    try {
      viewer = await completeLogin(store, loginToken);
    } catch (error) {
      if (error instanceof ValidationError) {
        throw new HttpError(410, t("login.error.linkUsed"));
      }
      throw error;
    }

    const headers = new Headers({ location: "/calendar/" });
    headers.append("set-cookie", viewerCookie(viewer.token));
    if (viewer.isAdmin) headers.append("set-cookie", adminCookie(viewer.token));
    return new Response(null, { status: 303, headers });
  },
});
