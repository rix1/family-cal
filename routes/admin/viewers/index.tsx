import { AdminShell } from "@/components/AdminShell.tsx";
import { CopyButton } from "@/islands/CopyButton.tsx";
import { accessUrls, createViewer, expirePreviousViewerLinks } from "@/lib/access_links.ts";
import { adminDenied, adminViewer } from "@/lib/admin_auth.ts";
import { getStore } from "@/lib/db.ts";
import { viewerIsActive } from "@/lib/model.ts";
import { define } from "@/utils.ts";
import { HttpError } from "fresh";
import { page } from "fresh";

export const handlers = define.handlers({
  async GET(ctx) {
    const store = await getStore();
    const viewer = await adminViewer(ctx.req, store);
    if (!viewer) return adminDenied();
    const [viewers, groups] = await Promise.all([store.listViewers(), store.listGroups()]);
    const createdToken = ctx.url.searchParams.get("created");
    const created = createdToken ? await store.getViewer(createdToken) : null;
    const baseUrl = Deno.env.get("BASE_URL") ?? ctx.url.origin;
    return page({
      viewer,
      viewers,
      groups,
      created: created && viewerIsActive(created)
        ? { viewer: created, urls: accessUrls(created, baseUrl) }
        : null,
    });
  },
  async POST(ctx) {
    const store = await getStore();
    const actor = await adminViewer(ctx.req, store);
    if (!actor) return adminDenied();
    const form = await ctx.req.formData();
    const name = String(form.get("name") ?? "").trim();
    if (!name) throw new HttpError(400, "Viewer name is required.");

    const knownGroups = new Set((await store.listGroups()).map((group) => group.key));
    const groups = form.getAll("groups").map(String);
    if (groups.some((group) => !knownGroups.has(group))) {
      throw new HttpError(400, "One or more selected groups are invalid.");
    }

    const viewer = createViewer({
      name,
      groups,
      canEdit: form.get("canEdit") === "on",
    });
    await expirePreviousViewerLinks(store, viewer);
    await store.upsertViewer(viewer);
    return new Response(null, {
      status: 303,
      headers: { location: `/admin/viewers/?created=${encodeURIComponent(viewer.token)}` },
    });
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
      <div class="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 class="text-3xl font-semibold">Viewers</h1>
          <p class="mt-2 text-zinc-600">Capability links and their permissions.</p>
        </div>
        <details class="group">
          <summary class="cursor-pointer list-none rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700">
            New viewer
          </summary>
          <form
            method="post"
            class="mt-3 grid min-w-72 gap-4 rounded-xl border border-zinc-200 bg-white p-4 shadow-lg sm:min-w-96"
          >
            <label class="grid gap-1.5 text-sm font-medium">
              Name
              <input
                name="name"
                required
                class="rounded-lg border border-zinc-300 px-3 py-2"
                placeholder="Family member"
              />
            </label>
            <fieldset>
              <legend class="text-sm font-medium">Calendar groups</legend>
              <p class="mt-1 text-xs text-zinc-500">No selection means all groups.</p>
              <div class="mt-2 grid gap-2 sm:grid-cols-2">
                {data.groups.map((group) => (
                  <label class="flex items-center gap-2 text-sm">
                    <input type="checkbox" name="groups" value={group.key} />
                    <span>{group.flag} {group.label}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            <label class="flex items-center gap-2 text-sm font-medium">
              <input type="checkbox" name="canEdit" />
              Allow administration and editing
            </label>
            <button
              type="submit"
              class="rounded-lg bg-teal-700 px-4 py-2 text-sm font-medium text-white hover:bg-teal-600"
            >
              Create private link
            </button>
          </form>
        </details>
      </div>

      {data.created && (
        <section class="mt-8 rounded-xl border border-teal-300 bg-teal-50 p-5">
          <h2 class="text-lg font-semibold">Link created for {data.created.viewer.name}</h2>
          <p class="mt-1 text-sm text-zinc-600">
            Share the calendar link privately. This is also their login link.
          </p>
          <div class="mt-4 grid gap-3">
            {[
              ["Calendar", data.created.urls.calendar],
              ...(data.created.urls.editor ? [["Admin", data.created.urls.editor]] : []),
              ["iCal subscription", data.created.urls.ical],
            ].map(([label, url]) => (
              <div class="flex flex-col gap-2 sm:flex-row sm:items-center">
                <div class="min-w-0 flex-1">
                  <p class="text-xs font-semibold uppercase text-zinc-500">{label}</p>
                  <code class="block truncate text-sm">{url}</code>
                </div>
                <CopyButton value={url} label={`Copy ${label.toLowerCase()}`} />
              </div>
            ))}
          </div>
        </section>
      )}

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
