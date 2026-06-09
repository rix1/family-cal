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
    const requested = Number(ctx.url.searchParams.get("limit") ?? "100");
    // Clamp to a sane window so a huge ?limit can't pull the whole audit log.
    const limit = Number.isFinite(requested)
      ? Math.min(Math.max(1, Math.floor(requested)), 500)
      : 100;
    return json({ audit: await store.listAudit(limit) });
  },
});
