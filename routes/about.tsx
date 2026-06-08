import { AppHeader } from "@/components/AppHeader.tsx";
import { getStore } from "@/lib/db.ts";
import { sessionViewer } from "@/lib/viewer_auth.ts";
import { define } from "@/utils.ts";
import { page } from "fresh";

export const handlers = define.handlers({
  async GET(ctx) {
    const viewer = await sessionViewer(ctx.req, await getStore());
    return page({
      viewerName: viewer?.name,
      adminUrl: viewer?.canEdit ? "/admin/" : undefined,
    });
  },
});

export default define.page<typeof handlers>(function About({ data }) {
  return (
    <>
      <title>About Family Calendar</title>
      <style>
        {`
          :root { color-scheme: light; --paper:#f6f1e8; --ink:#1d2422; --muted:#68736f; --line:#e4dccf; --teal:#0f766e; --surface:#fffaf1; }
          body { margin:0; background:var(--paper); color:var(--ink); font-size:16px; line-height:1.55; }
          .about-main { max-width: 860px; margin: 0 auto; padding: 40px 20px 80px; }
          .about-title { font-size: clamp(2rem, 5vw, 3.5rem); line-height:1; margin: 0 0 12px; }
          .about-section h2 { margin-top:0; }
          .about-main p, .about-main li { color: var(--muted); }
          .about-section { overflow-x:auto; border:1px solid var(--line); background:rgba(255,250,241,.72); border-radius:18px; padding:18px 20px; margin:16px 0; }
          .about-code { background:#efe8dc; border-radius:6px; padding:2px 6px; color:var(--ink); }
          .about-table { width:100%; border-collapse: collapse; font-size: .95rem; }
          .about-table th, .about-table td { text-align:left; border-bottom:1px solid var(--line); padding:10px 8px; vertical-align:top; }
          .about-table th { color:var(--ink); }
          .about-table td:first-child { white-space:nowrap; font-family: ui-monospace,SFMono-Regular,Menlo,monospace; font-size:.9rem; color:var(--ink); }
          .about-muted { color: var(--muted); }
          html[data-theme="dark"] { --paper:#111412; --ink:#edf2ef; --muted:#a8b1ac; --line:#303733; --teal:#8edbd0; --surface:#191e1b; }
          html[data-theme="dark"] .about-section { background:rgba(25,30,27,.82); }
          html[data-theme="dark"] .about-code { background:#252b27; }
        `}
      </style>

      <AppHeader
        title="About"
        viewerName={data.viewerName}
        calendarUrl={data.viewerName ? "/calendar/" : undefined}
        adminUrl={data.adminUrl}
        aboutUrl={null}
        logoutUrl={data.viewerName ? "/logout" : undefined}
      />

      <main class="about-main">
        <h1 class="about-title">Family Calendar</h1>
        <p>
          A private family calendar prototype for birthdays and other important dates, backed by
          Deno KV and exposed as per-viewer iCal feeds.
        </p>

        <section class="about-section">
          <h2>Pages & features</h2>
          <ul>
            <li>
              Private calendar links show the current-month timeline, filters, search, and
              upcoming/recent summaries.
            </li>
            <li>
              Editor-capable links open{" "}
              <code class="about-code">/admin/</code>, where people, groups, viewers, and audit
              history can be managed or inspected.
            </li>
            <li>
              Each viewer link also has an iCal subscription URL for Google, Apple, Outlook, etc.
            </li>
          </ul>
        </section>

        <section class="about-section">
          <h2>API docs</h2>
          <table class="about-table">
            <thead>
              <tr>
                <th>Route</th>
                <th>Description</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>GET /api/data/&lt;token&gt;</td>
                <td>
                  Returns <code class="about-code">{"{ groups, people, holidays }"}</code>{" "}
                  for the web app. Holidays are computed for a moving year window.
                </td>
              </tr>
              <tr>
                <td>POST/PATCH /api/people/&lt;editor-token&gt;</td>
                <td>
                  POST replaces the people collection with{" "}
                  <code class="about-code">{"{ people }"}</code>; PATCH updates one person. Both
                  validate and audit changes under the editor token.
                </td>
              </tr>
              <tr>
                <td>GET /api/audit/&lt;editor-token&gt;?limit=100</td>
                <td>Most-recent-first audit log.</td>
              </tr>
              <tr>
                <td>GET /cal/&lt;token&gt;.ics</td>
                <td>
                  Per-viewer iCal feed. Issue private tokens with{" "}
                  <code class="about-code">deno task issue-link</code>.
                </td>
              </tr>
              <tr>
                <td>GET /health</td>
                <td>Plain-text health check.</td>
              </tr>
            </tbody>
          </table>
        </section>

        <section class="about-section">
          <h2>Data model</h2>
          <p>
            Runtime data lives in Deno KV. New stores are empty; the optional{" "}
            <code class="about-code">deno task seed</code> command loads CSV files from{" "}
            <code class="about-code">seed/</code>. Current people shape:
          </p>
          <p>
            <code class="about-code">{"{ id, name, born, died, groups, notes }"}</code>
          </p>
          <p class="about-muted">
            <code class="about-code">born</code> accepts <code class="about-code">YYYY-MM-DD</code>,
            {" "}
            <code class="about-code">MM-DD</code>, or <code class="about-code">null</code>.
            <code class="about-code">died</code> is a full date or{"  "}
            <code class="about-code">null</code>.
          </p>
          <p class="about-muted">
            Type <code class="about-code">@</code>{" "}
            in editor notes to select and link another person, for example{" "}
            <code class="about-code">@solveig</code>. Existing wiki-style links such as{" "}
            <code class="about-code">[[Solveig]]</code> remain supported.
          </p>
        </section>

        <section class="about-section">
          <h2>Operational notes</h2>
          <ul>
            <li>
              Private links are capabilities. Anyone holding one has its access, so share it
              privately and replace it if it leaks.
            </li>
            <li>
              Google Calendar may refresh subscribed feeds slowly and uses its own per-calendar
              notification settings.
            </li>
            <li>Calendar and editor are Fresh islands; About ships zero client JavaScript.</li>
          </ul>
        </section>
      </main>
    </>
  );
});
