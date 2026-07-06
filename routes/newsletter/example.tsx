import { AppHeader } from "@/components/AppHeader.tsx";
import { getStore } from "@/lib/db.ts";
import { t } from "@/lib/i18n.ts";
import { newsletterProfileUrl, renderNewsletterEmail } from "@/lib/newsletter.ts";
import { sessionViewer } from "@/lib/viewer_auth.ts";
import { define } from "@/utils.ts";
import { HttpError, page } from "fresh";

/**
 * Shows the most recent newsletter issue exactly as it lands in the inbox —
 * linked from onboarding so new members know what they're subscribing to. The
 * email renders in a sandboxed iframe so its inline styles stay isolated from
 * the page (and vice versa).
 */
export const handlers = define.handlers({
  async GET(ctx) {
    const store = await getStore();
    const viewer = await sessionViewer(ctx.req, store);
    if (!viewer) throw new HttpError(404, t("error.requiresLink"));
    const drafts = await store.listNewsletterDrafts();
    const latest = drafts
      .slice()
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
    return page({
      viewerName: viewer.name,
      adminUrl: viewer.isAdmin ? "/admin/" : undefined,
      emailHtml: latest ? renderNewsletterEmail(latest, newsletterProfileUrl()) : null,
    });
  },
});

export default define.page<typeof handlers>(({ data }) => (
  <>
    <title>{`${t("newsletter.example.title")} | ${t("app.name")}`}</title>
    <div class="min-h-screen">
      <AppHeader
        title={t("newsletter.example.title")}
        viewerName={data.viewerName}
        adminUrl={data.adminUrl}
        logoutUrl="/logout"
      />
      <main class="mx-auto max-w-3xl px-4 pb-20 pt-8">
        <h1 class="text-2xl font-semibold tracking-tight">{t("newsletter.example.title")}</h1>
        <p class="mt-2 leading-relaxed text-ink-2">{t("newsletter.example.intro")}</p>
        {data.emailHtml
          ? (
            <iframe
              srcdoc={data.emailHtml}
              sandbox=""
              title={t("newsletter.example.title")}
              class="mt-6 h-[75vh] w-full rounded-xl border border-line bg-white"
            />
          )
          : (
            <p class="card mt-6 p-6 text-sm leading-relaxed text-ink-2">
              {t("newsletter.example.none")}
            </p>
          )}
      </main>
    </div>
  </>
));
