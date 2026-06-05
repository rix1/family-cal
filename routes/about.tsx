import { define } from "@/utils.ts";

const feedUrl = "/cal/demo-all.ics";

export default define.page(function About() {
  return (
    <>
      <title>About Family Calendar</title>
      <style>
        {`
          :root { color-scheme: light; --paper:#f6f1e8; --ink:#1d2422; --muted:#68736f; --line:#e4dccf; --teal:#0f766e; --surface:#fffaf1; }
          body { margin:0; background:var(--paper); color:var(--ink); font:16px/1.55 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; }
          .about-main { max-width: 860px; margin: 0 auto; padding: 40px 20px 80px; }
          .about-nav { display:flex; gap:10px; flex-wrap:wrap; margin-bottom:28px; }
          .about-link { color: var(--teal); font-weight: 650; text-decoration: none; }
          .about-link:hover { text-decoration: underline; }
          .about-pill { border:1px solid var(--line); background:var(--surface); border-radius:999px; padding:8px 12px; color:var(--ink); }
          .about-title { font-size: clamp(2rem, 5vw, 3.5rem); line-height:1; margin: 0 0 12px; }
          .about-section h2 { margin-top:0; }
          .about-main p, .about-main li { color: var(--muted); }
          .about-section { border:1px solid var(--line); background:rgba(255,250,241,.72); border-radius:18px; padding:18px 20px; margin:16px 0; }
          .about-code { background:#efe8dc; border-radius:6px; padding:2px 6px; color:var(--ink); }
          .about-table { width:100%; border-collapse: collapse; font-size: .95rem; }
          .about-table th, .about-table td { text-align:left; border-bottom:1px solid var(--line); padding:10px 8px; vertical-align:top; }
          .about-table th { color:var(--ink); }
          .about-table td:first-child { white-space:nowrap; font-family: ui-monospace,SFMono-Regular,Menlo,monospace; font-size:.9rem; color:var(--ink); }
          .about-muted { color: var(--muted); }
        `}
      </style>

      <main class="about-main">
        <nav class="about-nav" aria-label="Main navigation">
          <a class="about-link about-pill" href="/">Calendar</a>
          <a class="about-link about-pill" href="/edit.html">Edit</a>
          <a class="about-link about-pill" href={feedUrl}>Demo iCal feed</a>
        </nav>

        <h1 class="about-title">Family Calendar</h1>
        <p>
          A private family calendar prototype for birthdays and other important dates, backed by
          Deno KV and exposed as per-viewer iCal feeds.
        </p>

        <section class="about-section">
          <h2>Pages & features</h2>
          <ul>
            <li>
              <a class="about-link" href="/">Calendar</a>{" "}
              — current-month timeline, filters, search, upcoming/recent summaries.
            </li>
            <li>
              <a class="about-link" href="/edit.html">Editor</a>{" "}
              — add/edit people, save to KV, export <code class="about-code">people.csv</code>{" "}
              as backup.
            </li>
            <li>
              <a class="about-link" href={feedUrl}>iCal feed</a>{" "}
              — subscribe from Google, Apple, Outlook, etc.
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
                <td>GET /api/data</td>
                <td>
                  Returns <code class="about-code">{"{ groups, people, holidays }"}</code>{" "}
                  for the web app. Holidays are computed for a moving year window.
                </td>
              </tr>
              <tr>
                <td>POST /api/people</td>
                <td>
                  Full replacement write: body is{" "}
                  <code class="about-code">{"{ actor, people }"}</code>. The server validates dates,
                  diffs changes, writes KV, and appends audit entries.
                </td>
              </tr>
              <tr>
                <td>GET /api/audit?limit=100</td>
                <td>Most-recent-first audit log.</td>
              </tr>
              <tr>
                <td>GET /cal/&lt;token&gt;.ics</td>
                <td>
                  Per-viewer iCal feed. Seed tokens: <code class="about-code">demo-all</code>,{" "}
                  <code class="about-code">demo-no</code>, <code class="about-code">demo-dk</code>.
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
            Runtime data lives in Deno KV. Fresh KV stores are bootstrapped from CSV files in{" "}
            <code class="about-code">seed/</code>. Current people shape:
          </p>
          <p>
            <code class="about-code">{"{ id, name, born, died, groups, notes }"}</code>
          </p>
          <p class="about-muted">
            <code class="about-code">born</code> accepts <code class="about-code">YYYY-MM-DD</code>,
            {" "}
            <code class="about-code">MM-DD</code>, or <code class="about-code">null</code>.
            <code class="about-code">died</code> is a full date or{" "}
            <code class="about-code">null</code>.
          </p>
        </section>

        <section class="about-section">
          <h2>Prototype caveats</h2>
          <ul>
            <li>Viewer feed tokens exist, but the web app and write API are not gated yet.</li>
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
