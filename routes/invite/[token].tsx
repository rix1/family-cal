import { createViewer } from "@/lib/access_links.ts";
import { getStore } from "@/lib/db.ts";
import { inviteIsActive } from "@/lib/model.ts";
import { clientKey, RateLimiter } from "@/lib/rate_limit.ts";
import { define } from "@/utils.ts";
import { HttpError, page } from "fresh";

// Bound abuse of this unauthenticated endpoint: at most 5 signups per client
// per 10 minutes. The per-invite signup limit caps the total separately.
const signupLimiter = new RateLimiter({ windowMs: 10 * 60_000, max: 5 });

async function inviteData(token: string) {
  const store = await getStore();
  const invite = await store.getInvite(token);
  if (!invite) throw new HttpError(404, "This family invite was not found.");
  if (!inviteIsActive(invite)) {
    throw new HttpError(410, "This family invite has expired. Ask for a new one.");
  }
  return { store, invite };
}

export const handlers = define.handlers({
  async GET(ctx) {
    const { store, invite } = await inviteData(ctx.params.token);
    return page({ invite, groups: await store.listGroups() });
  },
  async POST(ctx) {
    if (!signupLimiter.check(clientKey(ctx.req, ctx.info)).allowed) {
      throw new HttpError(429, "Too many signups from your network. Please wait and try again.");
    }
    const { store, invite } = await inviteData(ctx.params.token);
    const form = await ctx.req.formData();
    const name = String(form.get("name") ?? "").trim();
    if (!name) throw new HttpError(400, "Your name is required.");

    const knownGroups = new Set((await store.listGroups()).map((group) => group.key));
    const groups = form.getAll("groups").map(String);
    if (groups.some((group) => !knownGroups.has(group))) {
      throw new HttpError(400, "One or more selected groups are invalid.");
    }

    // Self-chosen names are untrusted, so we do NOT expire existing same-named
    // viewers here (that would let a redeemer lock out an admin). Each signup is
    // an independent capability; the viewer token makes the audit entry unambiguous.
    const viewer = createViewer({ name, groups, canEdit: invite.canEdit });
    await store.upsertViewer(viewer);
    // Count this redemption so a signup limit (if set) is enforced on the next open.
    await store.upsertInvite({ ...invite, uses: (invite.uses ?? 0) + 1 });
    await store.appendAudit({
      at: new Date().toISOString(),
      actor: name,
      action: "accept_invite",
      targetId: viewer.token,
      detail: `Joined through invite ${invite.token} as viewer ${viewer.token}`,
    });
    return new Response(null, {
      status: 303,
      headers: { location: `/view/${encodeURIComponent(viewer.token)}` },
    });
  },
});

export default define.page<typeof handlers>(({ data }) => (
  <>
    <title>Join Family Calendar</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <main class="grid min-h-screen place-items-center bg-zinc-50 px-4 py-12 text-zinc-950">
      <section class="w-full max-w-lg rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm sm:p-8">
        <p class="text-xs font-semibold uppercase tracking-[0.16em] text-teal-700">
          Family calendar
        </p>
        <h1 class="mt-2 text-3xl font-semibold">Join the family calendar</h1>
        <p class="mt-3 text-zinc-600">
          Add your name and choose the family groups you want included in your calendar.
        </p>

        <form method="post" class="mt-8 grid gap-6">
          <label class="grid gap-2 text-sm font-medium">
            Your name
            <input
              name="name"
              required
              autofocus
              autocomplete="name"
              class="rounded-lg border border-zinc-300 px-3 py-2.5"
              placeholder="First and last name"
            />
          </label>

          <fieldset>
            <legend class="text-sm font-medium">Your family groups</legend>
            <p class="mt-1 text-xs text-zinc-500">
              Choose all that apply. No selection shows the full family calendar.
            </p>
            <div class="mt-3 grid gap-2 sm:grid-cols-2">
              {data.groups.map((group) => (
                <label class="flex items-center gap-3 rounded-lg border border-zinc-200 px-3 py-2.5 text-sm">
                  <input type="checkbox" name="groups" value={group.key} />
                  <span>{group.flag} {group.label}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <button
            type="submit"
            class="rounded-lg bg-teal-700 px-4 py-3 font-medium text-white hover:bg-teal-600"
          >
            Join and open calendar
          </button>
        </form>
      </section>
    </main>
  </>
));
