import { define } from "@/utils.ts";
import { getStore } from "@/lib/db.ts";
import { buildFeed } from "@/lib/feed.ts";

export const handler = define.handlers({
  async GET(ctx) {
    const store = await getStore();
    const token = ctx.params.token;
    const viewer = await store.getViewer(token);
    if (!viewer) return new Response("Unknown calendar link", { status: 404 });

    const ics = await buildFeed(store, {
      groups: viewer.groups,
      calName: viewer.name === "Everyone" ? "Family Calendar" : `Family Calendar — ${viewer.name}`,
    });

    return new Response(ics, {
      headers: {
        "content-type": "text/calendar; charset=utf-8",
        "content-disposition": `inline; filename="family-${token}.ics"`,
        "cache-control": "private, max-age=3600",
      },
    });
  },
});
