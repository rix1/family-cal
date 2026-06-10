import { AdminShell } from "@/components/AdminShell.tsx";
import { Toast } from "@/islands/Toast.tsx";
import { adminDenied, adminViewer } from "@/lib/admin_auth.ts";
import { getStore } from "@/lib/db.ts";
import type { GroupInfo } from "@/lib/model.ts";
import { define } from "@/utils.ts";
import { page } from "fresh";

export const handlers = define.handlers({
  async GET(ctx) {
    const store = await getStore();
    const viewer = await adminViewer(ctx.req, store);
    if (!viewer) return adminDenied();
    return page({
      viewer,
      groups: await store.listGroups(),
      saved: ctx.url.searchParams.get("saved") === "1",
    });
  },
  async POST(ctx) {
    const store = await getStore();
    const viewer = await adminViewer(ctx.req, store);
    if (!viewer) return adminDenied();
    const form = await ctx.req.formData();
    const keys = form.getAll("key").map(String);
    const labels = form.getAll("label").map(String);
    const flags = form.getAll("flag").map(String);
    const groups: GroupInfo[] = keys
      .map((key, index) => ({
        key: key.trim(),
        label: labels[index]?.trim() ?? "",
        flag: flags[index]?.trim() ?? "",
      }))
      .filter((group) => group.key && group.label);
    await store.setGroups(groups);
    return new Response(null, {
      status: 303,
      headers: { location: "/admin/groups/?saved=1" },
    });
  },
});

export default define.page<typeof handlers>(({ data }) => {
  const rows = [...data.groups, { key: "", label: "", flag: "" }];
  return (
    <>
      <title>Groups | Family Calendar Admin</title>
      <AdminShell
        current="groups"
        viewerName={data.viewer.name}
        calendarUrl="/calendar/"
      >
        <h1 class="text-2xl font-semibold tracking-tight">Groups</h1>
        <p class="mt-1 text-sm text-ink-2">Family tags used for viewer-specific calendars.</p>
        <form method="post" class="mt-8">
          <div class="card overflow-hidden">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Key</th>
                  <th>Label</th>
                  <th>Flag</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((group) => (
                  <tr>
                    <td>
                      <input name="key" value={group.key} class="input font-mono text-xs" />
                    </td>
                    <td>
                      <input name="label" value={group.label} class="input" />
                    </td>
                    <td>
                      <input name="flag" value={group.flag} class="input" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button type="submit" class="btn btn-primary mt-4">
            Save groups
          </button>
        </form>
        {data.saved && <Toast message="Saved groups." />}
      </AdminShell>
    </>
  );
});
