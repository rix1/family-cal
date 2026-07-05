import { AdminShell } from "@/components/AdminShell.tsx";
import { ConfirmPopover } from "@/components/ConfirmPopover.tsx";
import { CopyButton } from "@/islands/CopyButton.tsx";
import { Toast } from "@/islands/Toast.tsx";
import { accessUrls, createViewer, expirePreviousViewerLinks } from "@/lib/access_links.ts";
import { adminDenied, adminViewer } from "@/lib/admin_auth.ts";
import { getStore } from "@/lib/db.ts";
import { emailInUse } from "@/lib/login.ts";
import { viewerIsActive } from "@/lib/model.ts";
import { normalizeEmail } from "@/lib/newsletter.ts";
import { ValidationError } from "@/lib/people.ts";
import { define } from "@/utils.ts";
import { HttpError } from "fresh";
import { page } from "fresh";

export const handlers = define.handlers({
  async GET(ctx) {
    const store = await getStore();
    const viewer = await adminViewer(ctx.req, store);
    if (!viewer) return adminDenied();
    const [viewers, groups] = await Promise.all([store.listViewers(), store.listGroups()]);
    const query = ctx.url.searchParams.get("q")?.trim().toLocaleLowerCase() ?? "";
    const status = ctx.url.searchParams.get("status") ?? "all";
    const permission = ctx.url.searchParams.get("permission") ?? "all";
    const group = ctx.url.searchParams.get("group") ?? "all";
    const filteredViewers = viewers.filter((item) => {
      const matchesQuery = !query ||
        `${item.name} ${item.token}`.toLocaleLowerCase().includes(query);
      const matchesStatus = status === "all" ||
        (status === "active" ? viewerIsActive(item) : !viewerIsActive(item));
      const matchesPermission = permission === "all" ||
        (permission === "admin" ? item.canEdit : !item.canEdit);
      const matchesGroup = group === "all" ||
        (group === "none" ? item.groups.length === 0 : item.groups.includes(group));
      return matchesQuery && matchesStatus && matchesPermission && matchesGroup;
    });
    const createdToken = ctx.url.searchParams.get("created");
    const created = createdToken ? await store.getViewer(createdToken) : null;
    const baseUrl = Deno.env.get("BASE_URL") ?? ctx.url.origin;
    return page({
      viewer,
      viewers: filteredViewers,
      groups,
      filters: { query: ctx.url.searchParams.get("q") ?? "", status, permission, group },
      expired: ctx.url.searchParams.get("expired") === "1",
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
    if (form.get("action") === "expire") {
      const token = String(form.get("token") ?? "");
      if (!token) throw new HttpError(400, "Viewer token is required.");
      if (token === actor.token) {
        throw new HttpError(400, "You cannot expire the link you are currently using.");
      }
      const viewer = await store.getViewer(token);
      if (!viewer) throw new HttpError(404, "Viewer link was not found.");
      if (viewerIsActive(viewer)) {
        await store.upsertViewer({ ...viewer, expiredAt: new Date().toISOString() });
        await store.appendAudit({
          at: new Date().toISOString(),
          actor: actor.name,
          action: "expire_viewer",
          detail: `Expired access for ${viewer.name}`,
        });
      }
      return new Response(null, {
        status: 303,
        headers: { location: "/admin/viewers/?expired=1" },
      });
    }

    const name = String(form.get("name") ?? "").trim();
    if (!name) throw new HttpError(400, "Viewer name is required.");

    let email: string;
    try {
      email = normalizeEmail(form.get("email"));
    } catch (error) {
      if (error instanceof ValidationError) throw new HttpError(400, "A valid email is required.");
      throw error;
    }
    // Email identifies the viewer for magic-link sign-in, so it must be unique.
    if (await emailInUse(store, email)) {
      throw new HttpError(400, "That email already belongs to an active viewer.");
    }

    const knownGroups = new Set((await store.listGroups()).map((group) => group.key));
    const groups = form.getAll("groups").map(String);
    if (groups.some((group) => !knownGroups.has(group))) {
      throw new HttpError(400, "One or more selected groups are invalid.");
    }

    const viewer = createViewer({
      name,
      email,
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
    <AdminShell
      current="viewers"
      viewerName={data.viewer.name}
      calendarUrl="/calendar/"
    >
      <div class="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 class="text-2xl font-semibold tracking-tight">Viewers</h1>
          <p class="mt-1 text-sm text-ink-2">Capability links and their permissions.</p>
        </div>
        <details data-popover class="relative">
          <summary class="btn btn-primary cursor-pointer list-none [&::-webkit-details-marker]:hidden">
            New viewer
          </summary>
          <form
            method="post"
            class="card absolute right-0 z-30 mt-2 grid w-[min(24rem,calc(100vw-2rem))] gap-4 p-4 shadow-pop"
          >
            <label class="grid gap-1.5 text-sm font-medium">
              Name
              <input
                name="name"
                required
                class="input"
                placeholder="Family member"
              />
            </label>
            <label class="grid gap-1.5 text-sm font-medium">
              Email
              <input
                type="email"
                name="email"
                required
                class="input"
                placeholder="who@example.com"
              />
            </label>
            <fieldset>
              <legend class="text-sm font-medium">Calendar groups</legend>
              <p class="mt-1 text-xs text-ink-3">
                Followed groups; they can change these on their profile.
              </p>
              <div class="mt-2 grid gap-2 sm:grid-cols-2">
                {data.groups.map((group) => (
                  <label class="flex items-center gap-2 text-sm">
                    <input type="checkbox" name="groups" value={group.key} class="accent-accent" />
                    <span>{group.label}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            <label class="flex items-center gap-2 text-sm font-medium">
              <input type="checkbox" name="canEdit" class="accent-accent" />
              Allow administration and editing
            </label>
            <button type="submit" class="btn btn-primary">
              Create private link
            </button>
          </form>
        </details>
      </div>

      {data.created && (
        <section class="mt-8 rounded-xl border border-accent/40 bg-accent-soft p-5">
          <h2 class="text-lg font-semibold">Link created for {data.created.viewer.name}</h2>
          <p class="mt-1 text-sm text-ink-2">
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
                  <p class="kicker">{label}</p>
                  <code class="block truncate font-mono text-sm">{url}</code>
                </div>
                <CopyButton value={url} label={`Copy ${label.toLowerCase()}`} />
              </div>
            ))}
          </div>
        </section>
      )}

      {data.expired && <Toast message="Viewer link expired." />}

      <form
        method="get"
        class="card mt-8 grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-[minmax(14rem,1fr)_auto_auto_auto_auto]"
      >
        <label class="grid gap-1.5">
          <span class="kicker">Search</span>
          <input
            name="q"
            value={data.filters.query}
            placeholder="Name or token"
            class="input"
          />
        </label>
        <label class="grid gap-1.5">
          <span class="kicker">Status</span>
          <select name="status" class="input">
            <option value="all" selected={data.filters.status === "all"}>All</option>
            <option value="active" selected={data.filters.status === "active"}>Active</option>
            <option value="expired" selected={data.filters.status === "expired"}>Expired</option>
          </select>
        </label>
        <label class="grid gap-1.5">
          <span class="kicker">Permission</span>
          <select name="permission" class="input">
            <option value="all" selected={data.filters.permission === "all"}>All</option>
            <option value="admin" selected={data.filters.permission === "admin"}>Admin</option>
            <option value="view" selected={data.filters.permission === "view"}>View only</option>
          </select>
        </label>
        <label class="grid gap-1.5">
          <span class="kicker">Group</span>
          <select name="group" class="input">
            <option value="all" selected={data.filters.group === "all"}>All</option>
            <option value="none" selected={data.filters.group === "none"}>
              Follows nothing
            </option>
            {data.groups.map((item) => (
              <option value={item.key} selected={data.filters.group === item.key}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        <div class="flex items-end gap-2">
          <button type="submit" class="btn btn-primary">
            Filter
          </button>
          <a href="/admin/viewers/" class="btn btn-ghost">
            Clear
          </a>
        </div>
      </form>

      <div class="card mt-8 overflow-x-auto">
        <table class="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Token</th>
              <th>Groups</th>
              <th>Permission</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {data.viewers.map((item) => (
              <tr>
                <td class="font-medium">{item.name}</td>
                <td class="font-mono text-xs text-ink-2">{item.token}</td>
                <td class="text-ink-2">{item.groups.join(", ") || "—"}</td>
                <td>
                  {item.canEdit
                    ? <span class="badge bg-gold-soft text-gold">Admin</span>
                    : <span class="badge bg-inset text-ink-2">View</span>}
                </td>
                <td>
                  {item.expiredAt
                    ? <span class="badge bg-inset text-ink-3">Expired</span>
                    : <span class="badge bg-accent-soft text-accent-2">Active</span>}
                </td>
                <td class="text-right">
                  {viewerIsActive(item) && item.token !== data.viewer.token && (
                    <ConfirmPopover
                      id={`confirm-expire-${item.token}`}
                      triggerClass="btn btn-danger btn-sm"
                      trigger="Expire"
                      message={`Expire ${item.name}'s access link? Their current link stops working until you issue a new one.`}
                      confirmLabel="Expire access"
                    >
                      <input type="hidden" name="action" value="expire" />
                      <input type="hidden" name="token" value={item.token} />
                    </ConfirmPopover>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!data.viewers.length && (
          <p class="px-4 py-8 text-center text-sm text-ink-3">
            No viewers match these filters.
          </p>
        )}
      </div>
    </AdminShell>
  </>
));
