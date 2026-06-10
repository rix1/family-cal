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
    <AdminShell
      current="audit"
      viewerName={data.viewer.name}
      calendarUrl="/calendar/"
    >
      <h1 class="text-2xl font-semibold tracking-tight">Audit</h1>
      <p class="mt-1 text-sm text-ink-2">Most recent changes first.</p>
      <div class="card mt-8 overflow-x-auto">
        <table class="data-table">
          <thead>
            <tr>
              <th>When</th>
              <th>Actor</th>
              <th>Action</th>
              <th>Target</th>
            </tr>
          </thead>
          <tbody>
            {data.audit.map((entry) => (
              <tr>
                <td class="whitespace-nowrap font-mono text-xs text-ink-2">{entry.at}</td>
                <td class="font-medium">{entry.actor}</td>
                <td>
                  <span class="badge bg-inset text-ink-2">{entry.action}</span>
                </td>
                <td class="text-ink-2">{entry.detail ?? entry.targetId ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AdminShell>
  </>
));
