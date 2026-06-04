import { define } from "@/utils.ts";
import { getStore } from "@/lib/db.ts";
import { json } from "@/lib/http.ts";

export const handler = define.handlers({
  async GET(ctx) {
    const limit = Number(ctx.url.searchParams.get("limit") ?? "100");
    const store = await getStore();
    return json({ audit: await store.listAudit(Number.isFinite(limit) ? limit : 100) });
  },
});
