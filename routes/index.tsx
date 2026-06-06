import { define } from "@/utils.ts";
import { page } from "fresh";

export const handlers = define.handlers({
  GET() {
    return page({ demoMode: Deno.env.get("DEMO_MODE") === "true" });
  },
});

export default define.page<typeof handlers>(function AccessRequired({ data }) {
  return (
    <>
      <title>Family Calendar</title>
      <main style="max-width:36rem;margin:12vh auto;padding:2rem;font:16px/1.5 system-ui">
        <h1>Family Calendar</h1>
        {data.demoMode
          ? (
            <>
              <p>Select a demo capability. There is no password form.</p>
              <ul style="display:grid;gap:.75rem;padding-left:1.25rem">
                <li>
                  <a href="/view/demo-feature-all">Full family calendar</a>
                </li>
                <li>
                  <a href="/edit/demo-feature-editor">Editor</a>
                </li>
                <li>
                  <a href="/view/demo-feature-no">Norwegian-only calendar</a>
                </li>
                <li>
                  <a href="/view/demo-feature-dk">Danish-only calendar</a>
                </li>
                <li>
                  <a href="/cal/demo-feature-all.ics">iCal feed</a>
                </li>
              </ul>
            </>
          )
          : <p>This private calendar requires a family access link.</p>}
      </main>
    </>
  );
});
