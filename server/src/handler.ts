import type { Store } from "./store.ts";
import { buildFeed } from "./feed.ts";
import { applyPeople, type PersonInput, ValidationError } from "./people.ts";

export interface HandlerOptions {
  store: Store;
  /** Directory holding the web app files (index.html, edit.html, ...). */
  webRoot?: URL;
}

const FEED_PATH = /^\/cal\/([^/]+)\.ics$/;

const STATIC: Record<string, string> = {
  "/": "index.html",
  "/index.html": "index.html",
  "/edit.html": "edit.html",
  "/family-dates.js": "family-dates.js",
};

const CONTENT_TYPES: Record<string, string> = {
  html: "text/html; charset=utf-8",
  js: "text/javascript; charset=utf-8",
  css: "text/css; charset=utf-8",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

async function serveStatic(webRoot: URL, file: string): Promise<Response> {
  try {
    const bytes = await Deno.readFile(new URL(file, webRoot));
    const ext = file.split(".").pop() ?? "";
    return new Response(bytes, {
      headers: {
        "content-type": CONTENT_TYPES[ext] ?? "application/octet-stream",
      },
    });
  } catch {
    return new Response("Not found", {
      status: 404,
      headers: { "content-type": "text/plain" },
    });
  }
}

/** Build the HTTP request handler over a store. Pure of any module-global state. */
export function createHandler(
  opts: HandlerOptions,
): (req: Request) => Promise<Response> {
  const { store } = opts;
  // Web app lives at the repo root, two levels up from this module (server/src/).
  const webRoot = opts.webRoot ?? new URL("../../", import.meta.url);

  return async (req) => {
    const url = new URL(req.url);
    const { pathname } = url;

    // --- Per-viewer iCal feed: access + identity via the token ---
    const feedMatch = pathname.match(FEED_PATH);
    if (feedMatch) {
      if (req.method !== "GET") {
        return new Response("Method not allowed", { status: 405 });
      }
      const viewer = await store.getViewer(feedMatch[1]);
      if (!viewer) {
        return new Response("Unknown calendar link", { status: 404 });
      }
      const ics = await buildFeed(store, {
        groups: viewer.groups,
        calName: viewer.name === "Everyone"
          ? "Family Calendar"
          : `Family Calendar — ${viewer.name}`,
      });
      return new Response(ics, {
        headers: {
          "content-type": "text/calendar; charset=utf-8",
          "content-disposition": `inline; filename="family-${feedMatch[1]}.ics"`,
          "cache-control": "private, max-age=3600",
        },
      });
    }

    // --- JSON API consumed by the web app ---
    if (pathname === "/api/data" && req.method === "GET") {
      const [groups, people] = await Promise.all([
        store.listGroups(),
        store.listPeople(),
      ]);
      return json({ groups, people });
    }

    if (pathname === "/api/people" && req.method === "POST") {
      let payload: { people?: PersonInput[]; actor?: string };
      try {
        payload = await req.json();
      } catch {
        return json({ error: "invalid JSON body" }, 400);
      }
      const actor = (payload.actor ?? "").trim() || "unknown";
      try {
        const people = await applyPeople(store, payload.people ?? [], actor);
        return json({ people });
      } catch (err) {
        if (err instanceof ValidationError) {
          return json({ error: err.message }, 400);
        }
        throw err;
      }
    }

    if (pathname === "/api/audit" && req.method === "GET") {
      const limit = Number(url.searchParams.get("limit") ?? "100");
      return json({
        audit: await store.listAudit(Number.isFinite(limit) ? limit : 100),
      });
    }

    if (pathname === "/health") {
      return new Response("ok", { headers: { "content-type": "text/plain" } });
    }

    // --- Static web app ---
    if (req.method === "GET" && pathname in STATIC) {
      return await serveStatic(webRoot, STATIC[pathname]);
    }

    return new Response("Not found", {
      status: 404,
      headers: { "content-type": "text/plain" },
    });
  };
}
