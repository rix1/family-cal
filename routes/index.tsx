import { getStore } from "@/lib/db.ts";
import { sessionViewer } from "@/lib/viewer_auth.ts";
import { define } from "@/utils.ts";
import { page } from "fresh";

export const handlers = define.handlers({
  async GET(ctx) {
    const viewer = await sessionViewer(ctx.req, await getStore());
    if (viewer) {
      return new Response(null, { status: 303, headers: { location: "/calendar/" } });
    }
    return page({});
  },
});

export default define.page<typeof handlers>(function AccessRequired() {
  return (
    <>
      <title>Family Calendar</title>
      <main style="max-width:36rem;margin:12vh auto;padding:2rem;font-size:16px;line-height:1.5">
        <h1>Family Calendar</h1>
        <p>This private calendar requires a family access link.</p>
      </main>
    </>
  );
});
