import { AdminShell } from "@/components/AdminShell.tsx";
import { Toast } from "@/islands/Toast.tsx";
import { adminDenied, adminViewer } from "@/lib/admin_auth.ts";
import { getStore } from "@/lib/db.ts";
import { DEFAULT_GROUP_COLOR, GROUP_COLORS } from "@/lib/group_colors.ts";
import { type GroupInfo, isPersonalGroup } from "@/lib/model.ts";
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
    const descriptions = form.getAll("description").map(String);
    // Color is a per-row radio group (`color-<index>`), aligned with the
    // positional key/label arrays above.
    const branches: GroupInfo[] = keys
      .map((key, index) => ({
        key: key.trim(),
        label: labels[index]?.trim() ?? "",
        color: String(form.get(`color-${index}`) ?? DEFAULT_GROUP_COLOR),
        description: descriptions[index]?.trim() || undefined,
      }))
      .filter((group) => group.key && group.label);
    // The form edits branches only; personal lists are viewer-owned and must
    // survive this whole-list replacement (setGroups overwrites everything).
    const personal = (await store.listGroups()).filter(isPersonalGroup);
    const branchKeys = new Set(branches.map((group) => group.key));
    await store.setGroups([
      ...branches,
      ...personal.filter((group) => !branchKeys.has(group.key)),
    ]);
    return new Response(null, {
      status: 303,
      headers: { location: "/admin/groups/?saved=1" },
    });
  },
});

export default define.page<typeof handlers>(({ data }) => {
  const branches = data.groups.filter((group) => !isPersonalGroup(group));
  const personal = data.groups.filter(isPersonalGroup);
  const rows = [...branches, { key: "", label: "", color: DEFAULT_GROUP_COLOR }];
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
                  <th>Description</th>
                  <th>Color</th>
                  <th>Preview</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((group, index) => (
                  <tr>
                    <td>
                      <input name="key" value={group.key} class="input font-mono text-xs" />
                    </td>
                    <td>
                      <input name="label" value={group.label} class="input" />
                    </td>
                    <td>
                      <input
                        name="description"
                        value={group.description ?? ""}
                        placeholder="Who this group covers — shown at signup"
                        class="input min-w-48"
                      />
                    </td>
                    <td>
                      <div class="flex flex-wrap gap-1.5">
                        {GROUP_COLORS.map((color) => (
                          <label class="cursor-pointer" title={color.label}>
                            <input
                              type="radio"
                              name={`color-${index}`}
                              value={color.key}
                              checked={(group.color || DEFAULT_GROUP_COLOR) === color.key}
                              class="peer sr-only"
                            />
                            <span
                              class={`block size-6 rounded-full border-2 opacity-60 transition peer-checked:opacity-100 peer-checked:ring-2 peer-checked:ring-ink/25 peer-checked:ring-offset-1 peer-checked:ring-offset-surface peer-focus-visible:ring-2 peer-focus-visible:ring-accent ${color.bg} ${color.border}`}
                            />
                            <span class="sr-only">{color.label}</span>
                          </label>
                        ))}
                      </div>
                    </td>
                    <td>
                      <span class="badge group-preview">{group.label || "Preview"}</span>
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
        {personal.length > 0 && (
          <section class="mt-10">
            <h2 class="text-lg font-semibold tracking-tight">Personal lists</h2>
            <p class="mt-1 text-sm text-ink-2">
              Created and managed by their owners; shown here for reference only. Reassign an owner
              by editing the record if someone loses access.
            </p>
            <div class="card mt-4 overflow-hidden">
              <table class="data-table">
                <thead>
                  <tr>
                    <th>Key</th>
                    <th>Label</th>
                    <th>Owner</th>
                    <th>Visibility</th>
                  </tr>
                </thead>
                <tbody>
                  {personal.map((group) => (
                    <tr>
                      <td class="font-mono text-xs text-ink-2">{group.key}</td>
                      <td class="font-medium">{group.label}</td>
                      <td class="text-ink-2">{group.owner}</td>
                      <td>
                        {group.listed
                          ? <span class="badge bg-accent-soft text-accent-2">Shared</span>
                          : <span class="badge bg-inset text-ink-2">Private</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
        {data.saved && <Toast message="Saved groups." />}
      </AdminShell>
    </>
  );
});
