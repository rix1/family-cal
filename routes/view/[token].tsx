import { adminCookie } from "@/lib/admin_auth.ts";
import { getStore } from "@/lib/db.ts";
import { viewerIsActive } from "@/lib/model.ts";
import { viewerCookie } from "@/lib/viewer_auth.ts";
import { define } from "@/utils.ts";
import { HttpError } from "fresh";

export const handlers = define.handlers({
  async GET(ctx) {
    const store = await getStore();
    const viewer = await store.getViewer(ctx.params.token);
    if (!viewer) throw new HttpError(404, "This family calendar link was not found.");
    if (!viewerIsActive(viewer)) {
      throw new HttpError(410, "This family access link has expired. Ask for a new one.");
    }
    const headers = new Headers({ location: "/calendar/" });
    headers.append("set-cookie", viewerCookie(viewer.token));
    if (viewer.canEdit) headers.append("set-cookie", adminCookie(viewer.token));
    return new Response(null, { status: 303, headers });
  },
});
