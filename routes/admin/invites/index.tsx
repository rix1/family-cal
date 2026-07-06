import { AdminShell } from "@/components/AdminShell.tsx";
import { ConfirmPopover } from "@/components/ConfirmPopover.tsx";
import { CopyButton } from "@/islands/CopyButton.tsx";
import { Toast } from "@/islands/Toast.tsx";
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
      expired: ctx.url.searchParams.get("expired") === "1",
      now: new Date().toISOString(),
    });
  },
  async POST(ctx) {
    const store = await getStore();
    const viewer = await adminViewer(ctx.req, store);
    if (!viewer) return adminDenied();
    const form = await ctx.req.formData();
    if (form.get("action") === "expire") {
      const token = String(form.get("token") ?? "");
      if (!token) throw new HttpError(400, "Invite token is required.");
      const invite = await store.getInvite(token);
      if (!invite) throw new HttpError(404, "Invite was not found.");
      if (inviteIsActive(invite)) {
        await store.upsertInvite({ ...invite, expiresAt: new Date().toISOString() });
        await store.appendAudit({
          at: new Date().toISOString(),
          actor: viewer.name,
          action: "expire_invite",
          targetId: invite.token,
          detail: `Expired invite ${invite.token}`,
        });
      }
      return new Response(null, {
        status: 303,
        headers: { location: "/admin/invites/?expired=1" },
      });
    }

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
      isAdmin: form.get("isAdmin") === "on",
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
    <AdminShell
      current="invites"
      viewerName={data.viewer.name}
      calendarUrl="/calendar/"
    >
      <div class="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 class="text-2xl font-semibold tracking-tight">Invites</h1>
          <p class="mt-1 max-w-2xl text-sm text-ink-2">
            Create a temporary signup link. Each person receives their own private link and can add
            and edit people and events right away.
          </p>
        </div>
        <details data-popover class="relative">
          <summary class="btn btn-primary cursor-pointer list-none [&::-webkit-details-marker]:hidden">
            New invite
          </summary>
          <form
            method="post"
            class="card absolute right-0 z-30 mt-2 grid w-[min(22rem,calc(100vw-2rem))] gap-4 p-4 shadow-pop"
          >
            <label class="grid gap-1.5 text-sm font-medium">
              Expires after
              <select name="duration" class="input">
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
                class="input"
              />
              <span class="text-xs font-normal text-ink-3">
                Max number of people who can join with this link. Leave blank for no limit.
              </span>
            </label>
            <label class="flex items-center gap-2 text-sm font-medium">
              <input type="checkbox" name="isAdmin" class="accent-accent" />
              Grant administrator access
            </label>
            <p class="text-xs text-ink-3">
              Everyone who joins can add and edit family data. Administrators can additionally
              manage members and invites, delete events, and send the newsletter — every signup
              through this link inherits it, so leave the box unchecked unless you are inviting an
              admin specifically.
            </p>
            <button type="submit" class="btn btn-primary">
              Create invite link
            </button>
          </form>
        </details>
      </div>

      {data.expired && <Toast message="Invite expired." />}

      {data.created && (
        <section class="mt-8 rounded-xl border border-accent/40 bg-accent-soft p-5">
          <h2 class="text-lg font-semibold">Invite ready to share</h2>
          <p class="mt-1 text-sm text-ink-2">
            It expires {new Date(data.created.invite.expiresAt).toLocaleString()}
            {data.created.invite.maxUses != null
              ? `, or after ${data.created.invite.maxUses} ${
                data.created.invite.maxUses === 1 ? "signup" : "signups"
              }`
              : ""}.
          </p>
          <div class="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
            <code class="min-w-0 flex-1 truncate font-mono text-sm">{data.created.url}</code>
            <CopyButton value={data.created.url} label="Copy invite link" />
          </div>
        </section>
      )}

      <div class="card mt-8 overflow-x-auto">
        <table class="data-table">
          <thead>
            <tr>
              <th>Created</th>
              <th>Expires</th>
              <th>Permission</th>
              <th>Signups</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {data.invites.map((invite) => {
              const url = inviteUrl(invite, data.baseUrl);
              const active = inviteIsActive(invite, new Date(data.now));
              return (
                <tr>
                  <td class="tabular-nums text-ink-2">
                    {new Date(invite.createdAt).toLocaleString()}
                  </td>
                  <td class="tabular-nums text-ink-2">
                    {new Date(invite.expiresAt).toLocaleString()}
                  </td>
                  <td>
                    {invite.isAdmin
                      ? <span class="badge bg-gold-soft text-gold">Admin</span>
                      : <span class="badge bg-inset text-ink-2">Member</span>}
                  </td>
                  <td class="tabular-nums">
                    {invite.uses ?? 0}
                    {invite.maxUses != null ? ` / ${invite.maxUses}` : ""}
                  </td>
                  <td>
                    {active
                      ? <span class="badge bg-accent-soft text-accent-2">Active</span>
                      : <span class="badge bg-inset text-ink-3">Expired</span>}
                  </td>
                  <td class="text-right">
                    <div class="flex items-center justify-end gap-2">
                      <CopyButton value={url} label="Copy" />
                      {active && (
                        <ConfirmPopover
                          id={`confirm-expire-${invite.token}`}
                          triggerClass="btn btn-danger btn-sm"
                          trigger="Expire"
                          message="Expire this invite link? Anyone holding it can no longer use it to join."
                          confirmLabel="Expire invite"
                        >
                          <input type="hidden" name="action" value="expire" />
                          <input type="hidden" name="token" value={invite.token} />
                        </ConfirmPopover>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!data.invites.length && (
          <p class="px-4 py-8 text-center text-sm text-ink-3">No invites created yet.</p>
        )}
      </div>
    </AdminShell>
  </>
));
