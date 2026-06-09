import { AdminShell } from "@/components/AdminShell.tsx";
import { CopyButton } from "@/islands/CopyButton.tsx";
import { adminDenied, adminViewer } from "@/lib/admin_auth.ts";
import { getStore } from "@/lib/db.ts";
import { createInvite, inviteUrl } from "@/lib/invites.ts";
import { inviteIsActive } from "@/lib/model.ts";
import { define } from "@/utils.ts";
import { HttpError, page } from "fresh";

const inviteDurations = {
  "30m": { label: "30 minutes", milliseconds: 30 * 60_000 },
  "4h": { label: "4 hours", milliseconds: 4 * 60 * 60_000 },
  "1d": { label: "1 day", milliseconds: 24 * 60 * 60_000 },
  "7d": { label: "7 days", milliseconds: 7 * 24 * 60 * 60_000 },
} as const;

export const handlers = define.handlers({
  async GET(ctx) {
    const store = await getStore();
    const viewer = await adminViewer(ctx.req, store);
    if (!viewer) return adminDenied();
    const invites = (await store.listInvites()).sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt)
    );
    const createdToken = ctx.url.searchParams.get("created");
    const created = createdToken ? await store.getInvite(createdToken) : null;
    const baseUrl = Deno.env.get("BASE_URL") ?? ctx.url.origin;
    return page({
      viewer,
      invites,
      created: created ? { invite: created, url: inviteUrl(created, baseUrl) } : null,
      baseUrl,
      now: new Date().toISOString(),
    });
  },
  async POST(ctx) {
    const store = await getStore();
    const viewer = await adminViewer(ctx.req, store);
    if (!viewer) return adminDenied();
    const form = await ctx.req.formData();
    const duration = String(form.get("duration") ?? "");
    if (!(duration in inviteDurations)) throw new HttpError(400, "Invite expiry is invalid.");
    const durationOption = inviteDurations[duration as keyof typeof inviteDurations];
    const now = new Date();
    const expiresAt = new Date(now.getTime() + durationOption.milliseconds).toISOString();
    const maxUsesRaw = String(form.get("maxUses") ?? "").trim();
    let maxUses: number | null = null;
    if (maxUsesRaw !== "") {
      maxUses = Number(maxUsesRaw);
      if (!Number.isInteger(maxUses) || maxUses < 1) {
        throw new HttpError(
          400,
          "Signup limit must be a positive whole number, or blank for none.",
        );
      }
    }
    const invite = createInvite(expiresAt, {
      createdAt: now.toISOString(),
      canEdit: form.get("canEdit") === "on",
      maxUses,
    });
    await store.upsertInvite(invite);
    return new Response(null, {
      status: 303,
      headers: { location: `/admin/invites/?created=${encodeURIComponent(invite.token)}` },
    });
  },
});

export default define.page<typeof handlers>(({ data }) => (
  <>
    <title>Invites | Family Calendar Admin</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <AdminShell
      current="invites"
      viewerName={data.viewer.name}
      calendarUrl="/calendar/"
    >
      <div class="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 class="text-3xl font-semibold">Invites</h1>
          <p class="mt-2 max-w-2xl text-zinc-600">
            Create a temporary signup link with the permission you choose. Each person receives
            their own private viewer link.
          </p>
        </div>
        <details class="group">
          <summary class="cursor-pointer list-none rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700">
            New invite
          </summary>
          <form
            method="post"
            class="mt-3 grid min-w-72 gap-4 rounded-xl border border-zinc-200 bg-white p-4 shadow-lg sm:min-w-80"
          >
            <label class="grid gap-1.5 text-sm font-medium">
              Expires after
              <select
                name="duration"
                class="rounded-lg border border-zinc-300 px-3 py-2"
              >
                {Object.entries(inviteDurations).map(([value, option]) => (
                  <option value={value} selected={value === "1d"}>{option.label}</option>
                ))}
              </select>
            </label>
            <label class="grid gap-1.5 text-sm font-medium">
              Signup limit (optional)
              <input
                type="number"
                name="maxUses"
                min="1"
                step="1"
                placeholder="No limit"
                class="rounded-lg border border-zinc-300 px-3 py-2"
              />
              <span class="text-xs font-normal text-zinc-500">
                Max number of people who can join with this link. Leave blank for no limit.
              </span>
            </label>
            <label class="flex items-center gap-2 text-sm font-medium">
              <input type="checkbox" name="canEdit" />
              Grant administrator access
            </label>
            <p class="text-xs text-zinc-500">
              Invites are view-only unless you check the box above. The invite can be used by
              multiple people until it expires; each person inherits this permission. Only grant
              administrator access on links you share with full care.
            </p>
            <button
              type="submit"
              class="rounded-lg bg-teal-700 px-4 py-2 text-sm font-medium text-white hover:bg-teal-600"
            >
              Create invite link
            </button>
          </form>
        </details>
      </div>

      {data.created && (
        <section class="mt-8 rounded-xl border border-teal-300 bg-teal-50 p-5">
          <h2 class="text-lg font-semibold">Invite ready to share</h2>
          <p class="mt-1 text-sm text-zinc-600">
            It expires {new Date(data.created.invite.expiresAt).toLocaleString()}
            {data.created.invite.maxUses != null
              ? `, or after ${data.created.invite.maxUses} ${
                data.created.invite.maxUses === 1 ? "signup" : "signups"
              }`
              : ""}.
          </p>
          <div class="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
            <code class="min-w-0 flex-1 truncate text-sm">{data.created.url}</code>
            <CopyButton value={data.created.url} label="Copy invite link" />
          </div>
        </section>
      )}

      <div class="mt-8 overflow-x-auto rounded-xl border border-zinc-200 bg-white">
        <table class="w-full text-left text-sm">
          <thead class="bg-zinc-100 text-xs uppercase text-zinc-500">
            <tr>
              <th class="px-4 py-3">Created</th>
              <th class="px-4 py-3">Expires</th>
              <th class="px-4 py-3">Permission</th>
              <th class="px-4 py-3">Signups</th>
              <th class="px-4 py-3">Status</th>
              <th class="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody class="divide-y divide-zinc-200">
            {data.invites.map((invite) => {
              const url = inviteUrl(invite, data.baseUrl);
              const active = inviteIsActive(invite, new Date(data.now));
              return (
                <tr>
                  <td class="px-4 py-3">{new Date(invite.createdAt).toLocaleString()}</td>
                  <td class="px-4 py-3">{new Date(invite.expiresAt).toLocaleString()}</td>
                  <td class="px-4 py-3">{invite.canEdit ? "Administrator" : "View only"}</td>
                  <td class="px-4 py-3">
                    {invite.uses ?? 0}
                    {invite.maxUses != null ? ` / ${invite.maxUses}` : ""}
                  </td>
                  <td class="px-4 py-3">{active ? "Active" : "Expired"}</td>
                  <td class="px-4 py-3 text-right">
                    <CopyButton value={url} label="Copy" />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!data.invites.length && (
          <p class="px-4 py-8 text-center text-sm text-zinc-500">No invites created yet.</p>
        )}
      </div>
    </AdminShell>
  </>
));
