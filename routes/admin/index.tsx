import { AdminShell } from "@/components/AdminShell.tsx";
import { adminCookie, adminDenied, adminViewer } from "@/lib/admin_auth.ts";
import { getStore } from "@/lib/db.ts";
import { define } from "@/utils.ts";
import { page } from "fresh";

export const handlers = define.handlers({
  async GET(ctx) {
    const store = await getStore();
    const token = ctx.url.searchParams.get("token");
    if (token) {
      const viewer = await store.getViewer(token);
      if (!viewer?.canEdit) return adminDenied();
      return new Response(null, {
        status: 303,
        headers: {
          location: "/admin/",
          "set-cookie": adminCookie(token),
        },
      });
    }

    const viewer = await adminViewer(ctx.req, store);
    if (!viewer) return adminDenied();
    const [people, groups, viewers] = await Promise.all([
      store.listPeople(),
      store.listGroups(),
      store.listViewers(),
    ]);
    return page({
      viewer,
      counts: {
        people: people.length,
        groups: groups.length,
        viewers: viewers.length,
      },
    });
  },
});

export default define.page<typeof handlers>(({ data }) => (
  <>
    <title>Administration | Family Calendar</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <AdminShell current="home" viewerName={data.viewer.name}>
      <h1 class="text-3xl font-semibold">Administration</h1>
      <p class="mt-2 text-zinc-600">Manage the family calendar's stored data.</p>
      <div class="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {Object.entries(data.counts).map(([label, count]) => (
          <div class="rounded-xl border border-zinc-200 bg-white p-5">
            <p class="text-sm capitalize text-zinc-500">{label}</p>
            <p class="mt-2 text-3xl font-semibold">{count}</p>
          </div>
        ))}
      </div>
    </AdminShell>
  </>
));
