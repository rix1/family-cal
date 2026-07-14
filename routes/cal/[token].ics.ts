import { define } from "@/utils.ts";
import { viewerByFeedToken } from "@/lib/access_links.ts";
import { getStore } from "@/lib/db.ts";
import { buildFeed, feedEtag, feedOptionsForViewer } from "@/lib/feed.ts";
import { recordFeedFetch } from "@/lib/feed_activity.ts";
import { viewerIsActive } from "@/lib/model.ts";

export const handler = define.handlers({
  async GET(ctx) {
    const store = await getStore();
    const token = ctx.params.token;
    // Prefer the stable feed token; fall back to the session token for links
    // issued before feed tokens existed.
    const viewer = (await viewerByFeedToken(store, token)) ?? (await store.getViewer(token));
    if (!viewer) return new Response("Unknown calendar link", { status: 404 });
    if (!viewerIsActive(viewer)) {
      return new Response("Calendar link expired; ask for a new one", { status: 410 });
    }

    const opts = feedOptionsForViewer(viewer);
    const etag = await feedEtag(store, opts);
    // Key activity by the stable feed token so legacy session-token fetches
    // land on the same record.
    await recordFeedFetch(store, viewer.feedToken ?? token, {
      userAgent: ctx.req.headers.get("user-agent") ?? "",
      etag,
    });

    const headers = {
      etag,
      "cache-control": "private, max-age=3600",
    };
    if (ctx.req.headers.get("if-none-match")?.includes(etag)) {
      return new Response(null, { status: 304, headers });
    }

    const ics = await buildFeed(store, opts);
    return new Response(ics, {
      headers: {
        ...headers,
        "content-type": "text/calendar; charset=utf-8",
        "content-disposition": `inline; filename="family-${token}.ics"`,
      },
    });
  },
});
