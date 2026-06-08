import { AdminShell } from "@/components/AdminShell.tsx";
import { adminDenied, adminViewer } from "@/lib/admin_auth.ts";
import { getStore } from "@/lib/db.ts";
import { define } from "@/utils.ts";
import { page } from "fresh";

export const handlers = define.handlers({
  async GET(ctx) {
    const store = await getStore();
    const viewer = await adminViewer(ctx.req, store);
    if (!viewer) return adminDenied();
    return page({ viewer, viewers: await store.listViewers() });
  },
});

export default define.page<typeof handlers>(({ data }) => (
  <>
    <title>Viewers | Family Calendar Admin</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <AdminShell
      current="viewers"
      viewerName={data.viewer.name}
      calendarUrl="/calendar/"
    >
      <h1 class="text-3xl font-semibold">Viewers</h1>
      <p class="mt-2 text-zinc-600">Capability links and their permissions.</p>
      <div class="mt-8 overflow-x-auto rounded-xl border border-zinc-200 bg-white">
        <table class="w-full text-left text-sm">
          <thead class="bg-zinc-100 text-xs uppercase text-zinc-500">
            <tr>
              <th class="px-4 py-3">Name</th>
              <th class="px-4 py-3">Token</th>
              <th class="px-4 py-3">Groups</th>
              <th class="px-4 py-3">Editor</th>
              <th class="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-zinc-200">
            {data.viewers.map((item) => (
              <tr>
                <td class="px-4 py-3 font-medium">{item.name}</td>
                <td class="px-4 py-3 font-mono text-xs">{item.token}</td>
                <td class="px-4 py-3">{item.groups.join(", ") || "All"}</td>
                <td class="px-4 py-3">{item.canEdit ? "Yes" : "No"}</td>
                <td class="px-4 py-3">{item.expiredAt ? "Expired" : "Active"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AdminShell>
  </>
));
