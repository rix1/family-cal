import { AppHeader } from "@/components/AppHeader.tsx";
import { GroupPicker } from "@/components/GroupPicker.tsx";
import { CopyButton } from "@/islands/CopyButton.tsx";
import { ensureFeedToken, setViewerGroups } from "@/lib/access_links.ts";
import { getStore } from "@/lib/db.ts";
import { ownPersonalGroup, visibleGroups } from "@/lib/groups.ts";
import { t } from "@/lib/i18n.ts";
import { clearNewsletterPreference, setNewsletterPreference } from "@/lib/newsletter.ts";
import { memberNamesByGroup, ValidationError } from "@/lib/people.ts";
import { sessionViewer } from "@/lib/viewer_auth.ts";
import { define } from "@/utils.ts";
import { HttpError, page } from "fresh";

export const handlers = define.handlers({
  async GET(ctx) {
    const store = await getStore();
    const viewer = await sessionViewer(ctx.req, store);
    if (!viewer) throw new HttpError(404, t("error.requiresLink"));
    const baseUrl = Deno.env.get("BASE_URL") ?? ctx.url.origin;
    const feedUrl = `${baseUrl}/cal/${await ensureFeedToken(store, viewer)}.ics`;
    const [groups, people] = await Promise.all([store.listGroups(), store.listPeople()]);
    const members = memberNamesByGroup(people);
    const ownList = ownPersonalGroup(groups, viewer.email);
    return page({
      viewerName: viewer.name,
      email: viewer.email,
      adminUrl: viewer.isAdmin ? "/admin/" : undefined,
      groups: visibleGroups(groups, viewer.email),
      ownList: ownList
        ? { key: ownList.key, label: ownList.label, listed: Boolean(ownList.listed) }
        : null,
      members,
      followedGroups: viewer.groups,
      subscribed: Boolean(viewer.newsletter),
      feedUrl,
      saved: ctx.url.searchParams.get("saved"),
    });
  },
  async POST(ctx) {
    const store = await getStore();
    const viewer = await sessionViewer(ctx.req, store);
    if (!viewer) throw new HttpError(404, t("error.requiresLink"));
    const form = await ctx.req.formData();
    const action = form.get("action");
    try {
      if (action === "groups") {
        await setViewerGroups(store, viewer, form.getAll("groups").map(String));
        return redirect("groups");
      }
      if (action === "unsubscribe") {
        await clearNewsletterPreference(store, viewer);
        return redirect("unsubscribed");
      }
      if (action === "subscribe") {
        await setNewsletterPreference(store, viewer);
        return redirect("subscribed");
      }
      if (action === "share-list" || action === "unshare-list") {
        const groups = await store.listGroups();
        const ownList = ownPersonalGroup(groups, viewer.email);
        if (!ownList) throw new HttpError(400, t("profile.error.unknownAction"));
        const listed = action === "share-list";
        await store.setGroups(
          groups.map((group) => group.key === ownList.key ? { ...group, listed } : group),
        );
        await store.appendAudit({
          at: new Date().toISOString(),
          actor: viewer.name,
          action: listed ? "share_list" : "unshare_list",
          detail: `${listed ? "Shared" : "Unshared"} personal list "${ownList.label}"`,
          groups: [ownList.key],
        });
        return redirect(listed ? "shared" : "unshared");
      }
    } catch (error) {
      if (error instanceof ValidationError) throw new HttpError(400, error.message);
      throw error;
    }
    throw new HttpError(400, t("profile.error.unknownAction"));
  },
});

function redirect(saved: string): Response {
  return new Response(null, { status: 303, headers: { location: `/profile/?saved=${saved}` } });
}

// Translation keys, resolved with t() at render time (module consts are shared
// across requests with different locales).
const FLASH: Record<string, string> = {
  groups: "profile.flash.groups",
  subscribed: "profile.flash.subscribed",
  unsubscribed: "profile.flash.unsubscribed",
  shared: "profile.flash.shared",
  unshared: "profile.flash.unshared",
};

export default define.page<typeof handlers>(({ data }) => {
  const webcalUrl = data.feedUrl.replace(/^https?:/, "webcal:");
  const googleUrl = `https://calendar.google.com/calendar/r?cid=${
    encodeURIComponent(data.feedUrl)
  }`;
  const flashKey = data.saved ? FLASH[data.saved] : undefined;
  const flash = flashKey ? t(flashKey) : "";
  return (
    <>
      <title>{`${t("profile.title")} | ${t("app.name")}`}</title>
      <div class="min-h-screen">
        <AppHeader
          title={t("profile.title")}
          viewerName={data.viewerName}
          current="profile"
          adminUrl={data.adminUrl}
          logoutUrl="/logout"
        />
        <main class="mx-auto max-w-2xl px-4 pb-20 pt-8">
          <h1 class="text-2xl font-semibold tracking-tight">{t("profile.title")}</h1>
          <p class="mt-2 leading-relaxed text-ink-2">
            {t("profile.intro")}
          </p>

          {flash && (
            <p class="mt-6 rounded-xl border border-accent/40 bg-accent-soft px-4 py-3 text-sm font-medium text-accent-2">
              {flash}
            </p>
          )}

          {/* Profile + group affiliation */}
          <section class="card mt-8 grid gap-6 p-6">
            <div>
              <h2 class="font-semibold">{t("profile.you")}</h2>
              <dl class="mt-3 grid gap-3 sm:grid-cols-2">
                <div>
                  <dt class="text-xs font-medium uppercase tracking-wide text-ink-3">
                    {t("profile.name")}
                  </dt>
                  <dd class="mt-0.5 text-sm">{data.viewerName}</dd>
                </div>
                <div>
                  <dt class="text-xs font-medium uppercase tracking-wide text-ink-3">
                    {t("profile.email")}
                  </dt>
                  <dd class="mt-0.5 text-sm">{data.email}</dd>
                </div>
              </dl>
              <p class="mt-2 text-xs text-ink-3">
                {t("profile.contactAdmin")}
              </p>
            </div>

            <form method="post" class="grid gap-3 border-t border-line pt-5">
              <input type="hidden" name="action" value="groups" />
              <div>
                <h3 class="text-sm font-medium">{t("profile.groups.title")}</h3>
                <p class="mt-1 text-xs text-ink-3">
                  {t("profile.groups.hint")}
                </p>
              </div>
              <GroupPicker
                groups={data.groups}
                members={data.members}
                selected={data.followedGroups}
                ownKeys={data.ownList ? [data.ownList.key] : []}
              />
              <button type="submit" class="btn btn-primary justify-self-start">
                {t("profile.groups.save")}
              </button>
            </form>

            {data.ownList && (
              <div class="flex items-center justify-between gap-4 border-t border-line pt-5">
                <div class="min-w-0">
                  <h3 class="text-sm font-medium">
                    {t("profile.shareList.title", { label: data.ownList.label })}
                  </h3>
                  <p class="mt-1 text-xs leading-relaxed text-ink-3">
                    {data.ownList.listed
                      ? t("profile.shareList.onHint")
                      : t("profile.shareList.offHint")}
                  </p>
                </div>
                <form method="post" class="shrink-0">
                  <input
                    type="hidden"
                    name="action"
                    value={data.ownList.listed ? "unshare-list" : "share-list"}
                  />
                  <button
                    type="submit"
                    role="switch"
                    aria-checked={data.ownList.listed}
                    aria-label={t("profile.shareList.switchLabel")}
                    class={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      data.ownList.listed ? "bg-accent" : "bg-line-2"
                    }`}
                  >
                    <span
                      class={`inline-block size-5 rounded-full bg-surface shadow transition-transform ${
                        data.ownList.listed ? "translate-x-[1.375rem]" : "translate-x-0.5"
                      }`}
                    />
                  </button>
                </form>
              </div>
            )}
          </section>

          {/* Monthly email */}
          <section class="card mt-4 flex items-center justify-between gap-4 p-6">
            <div class="min-w-0">
              <h2 class="font-semibold">{t("profile.newsletter.title")}</h2>
              <p class="mt-1 text-sm leading-relaxed text-ink-2">
                {t("profile.newsletter.body")}{" "}
                {t("profile.newsletter.sentTo", { email: data.email })}
              </p>
              <p class="mt-2 text-sm">
                <a
                  href="/newsletter/example"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="font-medium text-accent-2 underline underline-offset-2"
                >
                  {t("newsletter.example.link")}
                </a>
              </p>
            </div>
            <form method="post" class="shrink-0">
              <input
                type="hidden"
                name="action"
                value={data.subscribed ? "unsubscribe" : "subscribe"}
              />
              <button
                type="submit"
                role="switch"
                aria-checked={data.subscribed}
                aria-label={t("profile.newsletter.switchLabel")}
                class={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  data.subscribed ? "bg-accent" : "bg-line-2"
                }`}
              >
                <span
                  class={`inline-block size-5 rounded-full bg-surface shadow transition-transform ${
                    data.subscribed ? "translate-x-[1.375rem]" : "translate-x-0.5"
                  }`}
                />
              </button>
            </form>
          </section>

          {/* Calendar subscription */}
          <section class="card mt-4 grid gap-5 p-6">
            <div>
              <h2 class="font-semibold">{t("profile.feed.title")}</h2>
              <p class="mt-1 text-sm leading-relaxed text-ink-2">
                {t("profile.feed.body")}
              </p>
            </div>

            <div class="flex items-center gap-2">
              <input
                readonly
                value={data.feedUrl}
                aria-label={t("profile.feed.urlLabel")}
                class="input font-mono text-xs"
              />
              <CopyButton value={data.feedUrl} label={t("profile.feed.copy")} />
            </div>

            <div class="flex flex-wrap gap-2">
              <a
                class="btn btn-primary btn-sm"
                href={googleUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                {t("profile.feed.google")}
              </a>
              <a class="btn btn-ghost btn-sm" href={webcalUrl}>
                {t("profile.feed.apple")}
              </a>
            </div>

            <p class="text-xs text-ink-3">
              {t("profile.feed.private")}
            </p>
          </section>
        </main>
      </div>
    </>
  );
});
