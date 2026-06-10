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

function Code({ children }: { children: string }) {
  return (
    <code class="rounded-md bg-inset px-1.5 py-0.5 font-mono text-[0.85em] text-ink">
      {children}
    </code>
  );
}

export default define.page<typeof handlers>(function About({ data }) {
  return (
    <>
      <title>About Family Calendar</title>

      <AppHeader
        title="About"
        viewerName={data.viewerName}
        calendarUrl={data.viewerName ? "/calendar/" : undefined}
        adminUrl={data.adminUrl}
        aboutUrl={null}
        logoutUrl={data.viewerName ? "/logout" : undefined}
      />

      <main class="mx-auto max-w-3xl px-4 py-10 pb-20">
        <h1 class="text-3xl font-semibold tracking-tight">Family Calendar</h1>
        <p class="mt-3 max-w-2xl leading-relaxed text-ink-2">
          A private family calendar for birthdays and other important dates, backed by Deno KV and
          exposed as per-viewer iCal feeds.
        </p>

        <section class="card mt-8 overflow-x-auto p-6">
          <h2 class="text-lg font-semibold">Pages & features</h2>
          <ul class="mt-3 list-disc space-y-2 pl-5 leading-relaxed text-ink-2">
            <li>
              Private calendar links show the current-month timeline, filters, search, and
              upcoming/recent summaries.
            </li>
            <li>
              Editor-capable links open{" "}
              <Code>/admin/</Code>, where people, groups, viewers, and audit history can be managed
              or inspected.
            </li>
            <li>
              Each viewer link also has an iCal subscription URL for Google, Apple, Outlook, etc.
            </li>
          </ul>
        </section>

        <section class="card mt-4 overflow-x-auto p-6">
          <h2 class="text-lg font-semibold">API docs</h2>
          <table class="data-table mt-4">
            <thead>
              <tr>
                <th>Route</th>
                <th>Description</th>
              </tr>
            </thead>
            <tbody class="text-ink-2">
              <tr>
                <td class="whitespace-nowrap font-mono text-[13px] text-ink">
                  GET /api/data/&lt;token&gt;
                </td>
                <td>
                  Returns <Code>{"{ groups, people, holidays }"}</Code>{" "}
                  for the web app. Holidays are computed for a moving year window.
                </td>
              </tr>
              <tr>
                <td class="whitespace-nowrap font-mono text-[13px] text-ink">
                  POST/PATCH /api/people/&lt;editor-token&gt;
                </td>
                <td>
                  POST replaces the people collection with{" "}
                  <Code>{"{ people }"}</Code>; PATCH updates one person. Both validate and audit
                  changes under the editor token.
                </td>
              </tr>
              <tr>
                <td class="whitespace-nowrap font-mono text-[13px] text-ink">
                  GET /api/audit/&lt;editor-token&gt;?limit=100
                </td>
                <td>Most-recent-first audit log.</td>
              </tr>
              <tr>
                <td class="whitespace-nowrap font-mono text-[13px] text-ink">
                  GET /cal/&lt;token&gt;.ics
                </td>
                <td>
                  Per-viewer iCal feed. Issue private tokens with <Code>deno task issue-link</Code>.
                </td>
              </tr>
              <tr>
                <td class="whitespace-nowrap font-mono text-[13px] text-ink">GET /health</td>
                <td>Plain-text health check.</td>
              </tr>
            </tbody>
          </table>
        </section>

        <section class="card mt-4 overflow-x-auto p-6">
          <h2 class="text-lg font-semibold">Data model</h2>
          <div class="mt-3 space-y-3 leading-relaxed text-ink-2">
            <p>
              Runtime data lives in Deno KV. New stores are empty; the optional{" "}
              <Code>deno task seed</Code> command loads CSV files from{" "}
              <Code>seed/</Code>. Current people shape:
            </p>
            <p>
              <Code>{"{ id, name, born, died, groups, notes }"}</Code>
            </p>
            <p class="text-ink-3">
              <Code>born</Code> accepts <Code>YYYY-MM-DD</Code>, <Code>MM-DD</Code>, or{" "}
              <Code>null</Code>. <Code>died</Code> is a full date or <Code>null</Code>.
            </p>
            <p class="text-ink-3">
              Type <Code>@</Code> in editor notes to select and link another person, for example
              {" "}
              <Code>@solveig</Code>.
            </p>
          </div>
        </section>

        <section class="card mt-4 overflow-x-auto p-6">
          <h2 class="text-lg font-semibold">Operational notes</h2>
          <ul class="mt-3 list-disc space-y-2 pl-5 leading-relaxed text-ink-2">
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
