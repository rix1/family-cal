import { getStore } from "@/lib/db.ts";
import { json } from "@/lib/http.ts";
import { viewerIsActive } from "@/lib/model.ts";
import { calendarViewData } from "@/lib/view_data.ts";
import { define } from "@/utils.ts";

export const handler = define.handlers({
  async GET(ctx) {
    const store = await getStore();
    const viewer = await store.getViewer(ctx.params.token);
    if (!viewer) return json({ error: "unknown family calendar link" }, 404);
    if (!viewerIsActive(viewer)) {
      return json({ error: "family calendar link expired; ask for a new one" }, 410);
    }
    return json(await calendarViewData(store, viewer.groups));
  },
});
