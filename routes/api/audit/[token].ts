import { getStore } from "@/lib/db.ts";
import { json } from "@/lib/http.ts";
import { viewerIsActive } from "@/lib/model.ts";
import { define } from "@/utils.ts";

export const handler = define.handlers({
  async GET(ctx) {
    const store = await getStore();
    const viewer = await store.getViewer(ctx.params.token);
    if (!viewer) return json({ error: "unknown editor link" }, 404);
    if (!viewerIsActive(viewer)) return json({ error: "editor link expired" }, 410);
    if (!viewer.canEdit) return json({ error: "unknown editor link" }, 404);
    const limit = Number(ctx.url.searchParams.get("limit") ?? "100");
    return json({ audit: await store.listAudit(Number.isFinite(limit) ? limit : 100) });
  },
});
