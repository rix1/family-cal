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
        <h1 class="text-3xl font-semibold">Groups</h1>
        <p class="mt-2 text-zinc-600">Family tags used for viewer-specific calendars.</p>
        <form method="post" class="mt-8">
          <div class="overflow-hidden rounded-xl border border-zinc-200 bg-white">
            <table class="w-full text-left text-sm">
              <thead class="bg-zinc-100 text-xs uppercase text-zinc-500">
                <tr>
                  <th class="px-4 py-3">Key</th>
                  <th class="px-4 py-3">Label</th>
                  <th class="px-4 py-3">Flag</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-zinc-200">
                {rows.map((group) => (
                  <tr>
                    <td class="p-3">
                      <input name="key" value={group.key} class="w-full rounded border px-3 py-2" />
                    </td>
                    <td class="p-3">
                      <input
                        name="label"
                        value={group.label}
                        class="w-full rounded border px-3 py-2"
                      />
                    </td>
                    <td class="p-3">
                      <input
                        name="flag"
                        value={group.flag}
                        class="w-full rounded border px-3 py-2"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button
            type="submit"
            class="mt-4 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white"
          >
            Save groups
          </button>
        </form>
        {data.saved && <Toast message="Saved groups." />}
      </AdminShell>
    </>
  );
});
