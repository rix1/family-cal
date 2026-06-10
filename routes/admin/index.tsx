import { AdminShell } from "@/components/AdminShell.tsx";
import { adminCookie, adminDenied, adminViewer } from "@/lib/admin_auth.ts";
import { getStore } from "@/lib/db.ts";
import { viewerIsActive } from "@/lib/model.ts";
import { viewerCookie } from "@/lib/viewer_auth.ts";
import { define } from "@/utils.ts";
import { HttpError } from "fresh";
import { page } from "fresh";

export const handlers = define.handlers({
  async GET(ctx) {
    const store = await getStore();
    const token = ctx.url.searchParams.get("token");
    if (token) {
      const viewer = await store.getViewer(token);
      if (viewer && !viewerIsActive(viewer)) {
        throw new HttpError(410, "This family access link has expired. Ask for a new one.");
      }
      if (!viewer?.canEdit) return adminDenied();
      const headers = new Headers({ location: "/admin/" });
      headers.append("set-cookie", adminCookie(token));
      headers.append("set-cookie", viewerCookie(token));
      return new Response(null, { status: 303, headers });
    }

    const viewer = await adminViewer(ctx.req, store);
    if (!viewer) return adminDenied();
    const [people, groups, viewers, invites] = await Promise.all([
      store.listPeople(),
      store.listGroups(),
      store.listViewers(),
      store.listInvites(),
    ]);
    return page({
      viewer,
      counts: {
        people: people.length,
        groups: groups.length,
        viewers: viewers.length,
        invites: invites.length,
      },
    });
  },
});

export default define.page<typeof handlers>(({ data }) => (
  <>
    <title>Administration | Family Calendar</title>
    <AdminShell
      current="home"
      viewerName={data.viewer.name}
      calendarUrl="/calendar/"
    >
      <h1 class="text-2xl font-semibold tracking-tight">Administration</h1>
      <p class="mt-1 text-sm text-ink-2">Manage the family calendar's stored data.</p>
      <div class="mt-8 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Object.entries(data.counts).map(([label, count]) => (
          <div class="card p-5">
            <p class="kicker capitalize">{label}</p>
            <p class="mt-2 text-3xl font-semibold tabular-nums tracking-tight">{count}</p>
          </div>
        ))}
      </div>
    </AdminShell>
  </>
));
