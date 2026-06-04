import type { Store } from "./store.ts";
import { buildFeed } from "./feed.ts";

function landingPage(origin: string): string {
  const feedUrl = `${origin}/calendar.ics`;
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Family Calendar feed</title>
<style>
  body { font: 16px/1.6 system-ui, sans-serif; max-width: 40rem; margin: 4rem auto; padding: 0 1.25rem; color: #1d2422; }
  code { background: #f0ece3; padding: .15rem .4rem; border-radius: .35rem; }
  a.btn { display: inline-block; margin-top: .5rem; padding: .6rem 1rem; background: #0f766e; color: #fff; border-radius: .6rem; text-decoration: none; }
</style></head>
<body>
  <h1>Family Calendar feed</h1>
  <p>Subscribe to this URL in Google, Apple, or Outlook Calendar (“Subscribe from URL”):</p>
  <p><code>${feedUrl}</code></p>
  <p><a class="btn" href="/calendar.ics">Download .ics</a></p>
  <p style="color:#68736f">Per-viewer feeds and access tokens are coming next; this is the all-events feed.</p>
</body></html>`;
}

/** Build the HTTP request handler over a store. Pure of any global state. */
export function createHandler(store: Store): (req: Request) => Promise<Response> {
  return async (req) => {
    const url = new URL(req.url);

    if (
      req.method === "GET" && (url.pathname === "/calendar.ics" || url.pathname === "/cal/all.ics")
    ) {
      const ics = await buildFeed(store);
      return new Response(ics, {
        headers: {
          "content-type": "text/calendar; charset=utf-8",
          "content-disposition": 'inline; filename="family-calendar.ics"',
          "cache-control": "public, max-age=3600",
        },
      });
    }

    if (url.pathname === "/health") {
      return new Response("ok", { headers: { "content-type": "text/plain" } });
    }

    if (req.method === "GET" && url.pathname === "/") {
      return new Response(landingPage(url.origin), {
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }

    return new Response("Not found", { status: 404, headers: { "content-type": "text/plain" } });
  };
}
