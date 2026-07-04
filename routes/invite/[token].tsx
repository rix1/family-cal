import { BrandMark } from "@/components/AppHeader.tsx";
import { createViewer } from "@/lib/access_links.ts";
import { getStore } from "@/lib/db.ts";
import { t } from "@/lib/i18n.ts";
import { emailInUse } from "@/lib/login.ts";
import { inviteIsActive } from "@/lib/model.ts";
import { normalizeEmail } from "@/lib/newsletter.ts";
import { ValidationError } from "@/lib/people.ts";
import { clientKey, RateLimiter } from "@/lib/rate_limit.ts";
import { define } from "@/utils.ts";
import { HttpError, page } from "fresh";

// Bound abuse of this unauthenticated endpoint: at most 50 signups per client
// per 10 minutes (comfortably above a real family). The per-invite signup limit
// caps the total separately.
const signupLimiter = new RateLimiter({ windowMs: 10 * 60_000, max: 50 });

async function inviteData(token: string) {
  const store = await getStore();
  const invite = await store.getInvite(token);
  if (!invite) throw new HttpError(404, t("invite.error.notFound"));
  if (!inviteIsActive(invite)) {
    throw new HttpError(410, t("invite.error.expired"));
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
      throw new HttpError(429, t("invite.error.rateLimited"));
    }
    const { store, invite } = await inviteData(ctx.params.token);
    const form = await ctx.req.formData();
    const name = String(form.get("name") ?? "").trim();
    if (!name) throw new HttpError(400, t("invite.error.nameRequired"));

    let email: string;
    try {
      email = normalizeEmail(form.get("email"));
    } catch (error) {
      if (error instanceof ValidationError) {
        throw new HttpError(400, t("invite.error.invalidEmail"));
      }
      throw error;
    }
    // Email identifies you for magic-link sign-in, so it must be unique.
    if (await emailInUse(store, email)) {
      throw new HttpError(400, t("invite.error.emailInUse"));
    }

    const knownGroups = new Set((await store.listGroups()).map((group) => group.key));
    const groups = form.getAll("groups").map(String);
    if (groups.some((group) => !knownGroups.has(group))) {
      throw new HttpError(400, t("invite.error.invalidGroups"));
    }

    // Self-chosen names are untrusted, so we do NOT expire existing same-named
    // viewers here (that would let a redeemer lock out an admin). Each signup is
    // an independent capability; the viewer token makes the audit entry unambiguous.
    const viewer = createViewer({ name, email, groups, canEdit: invite.canEdit });
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
    // welcome=1 rides along to /calendar/ and triggers the one-time welcome tour.
    return new Response(null, {
      status: 303,
      headers: { location: `/view/${encodeURIComponent(viewer.token)}?welcome=1` },
    });
  },
});

export default define.page<typeof handlers>(({ data }) => (
  <>
    <title>{t("invite.pageTitle")}</title>
    <main class="grid min-h-screen place-items-center px-4 py-12">
      <section class="card w-full max-w-lg p-6 sm:p-8">
        <BrandMark />
        <p class="kicker mt-8">{t("invite.kicker")}</p>
        <h1 class="mt-2 text-2xl font-semibold tracking-tight">{t("invite.title")}</h1>
        <p class="mt-3 leading-relaxed text-ink-2">
          {t("invite.intro")}
        </p>
        <p class="mt-2 text-sm leading-relaxed text-ink-3">
          {t("invite.noPasswords")}
        </p>

        <form method="post" class="mt-8 grid gap-6">
          <label class="grid gap-2 text-sm font-medium">
            {t("invite.name")}
            <input
              name="name"
              required
              autofocus
              autocomplete="name"
              class="input"
              placeholder={t("invite.namePlaceholder")}
            />
          </label>

          <label class="grid gap-2 text-sm font-medium">
            {t("invite.email")}
            <input
              type="email"
              name="email"
              required
              autocomplete="email"
              class="input"
              placeholder={t("login.emailPlaceholder")}
            />
            <span class="text-xs font-normal text-ink-3">
              {t("invite.emailHint")}
            </span>
          </label>

          <fieldset>
            <legend class="text-sm font-medium">{t("invite.groups")}</legend>
            <p class="mt-1 text-xs leading-relaxed text-ink-3">
              {t("invite.groupsHint")}
            </p>
            <div class="mt-3 grid gap-2 sm:grid-cols-2">
              {data.groups.map((group) => (
                <label class="flex cursor-pointer items-start gap-3 rounded-lg border border-line-2 px-3 py-2.5 text-sm font-medium hover:bg-inset has-checked:border-accent has-checked:bg-accent-soft has-checked:text-accent-2">
                  <input
                    type="checkbox"
                    name="groups"
                    value={group.key}
                    class="mt-0.5 accent-accent"
                  />
                  <span class="min-w-0">
                    <span class="block">{group.label}</span>
                    {group.description && (
                      <span class="mt-0.5 block text-xs font-normal leading-relaxed text-ink-3">
                        {group.description}
                      </span>
                    )}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <button type="submit" class="btn btn-primary w-full">
            {t("invite.submit")}
          </button>
        </form>

        <p class="mt-6 text-center text-xs text-ink-3">
          {t("invite.footer.before")}{" "}
          <a href="/about" class="font-medium text-accent-2 underline underline-offset-2">
            {t("invite.footer.link")}
          </a>{" "}
          {t("invite.footer.after")}
        </p>
      </section>
    </main>
  </>
));
