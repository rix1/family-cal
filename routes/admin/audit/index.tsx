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
    return page({ viewer, audit: await store.listAudit(200) });
  },
});

export default define.page<typeof handlers>(({ data }) => (
  <>
    <title>Audit | Family Calendar Admin</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <AdminShell
      current="audit"
      viewerName={data.viewer.name}
      calendarUrl={`/view/${data.viewer.token}`}
    >
      <h1 class="text-3xl font-semibold">Audit</h1>
      <p class="mt-2 text-zinc-600">Most recent changes first.</p>
      <div class="mt-8 overflow-x-auto rounded-xl border border-zinc-200 bg-white">
        <table class="w-full text-left text-sm">
          <thead class="bg-zinc-100 text-xs uppercase text-zinc-500">
            <tr>
              <th class="px-4 py-3">When</th>
              <th class="px-4 py-3">Actor</th>
              <th class="px-4 py-3">Action</th>
              <th class="px-4 py-3">Target</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-zinc-200">
            {data.audit.map((entry) => (
              <tr>
                <td class="px-4 py-3 whitespace-nowrap">{entry.at}</td>
                <td class="px-4 py-3">{entry.actor}</td>
                <td class="px-4 py-3">{entry.action}</td>
                <td class="px-4 py-3">{entry.detail ?? entry.targetId ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AdminShell>
  </>
));
