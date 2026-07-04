import { AppHeader } from "@/components/AppHeader.tsx";
import { getStore } from "@/lib/db.ts";
import { t } from "@/lib/i18n.ts";
import { sessionViewer } from "@/lib/viewer_auth.ts";
import { define } from "@/utils.ts";
import type { ComponentChildren } from "preact";
import { page } from "fresh";

export const handlers = define.handlers({
  async GET(ctx) {
    const viewer = await sessionViewer(ctx.req, await getStore());
    return page({
      viewerName: viewer?.name,
      adminUrl: viewer?.canEdit ? "/admin/" : undefined,
    });
  },
});

function ProfileLink({ signedIn }: { signedIn: boolean }) {
  if (signedIn) {
    return (
      <a href="/profile/" class="font-medium text-accent-2 underline underline-offset-2">
        {t("about.profileLink")}
      </a>
    );
  }
  return <span class="font-medium text-ink">{t("about.profileLink")}</span>;
}

function Faq({ question, children }: { question: string; children: ComponentChildren }) {
  return (
    <details class="group border-t border-line py-4 first:border-t-0 first:pt-0">
      <summary class="flex cursor-pointer items-center justify-between gap-3 font-medium [&::-webkit-details-marker]:hidden">
        <span>{question}</span>
        <svg
          class="size-4 shrink-0 text-ink-3 transition-transform group-open:rotate-180"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          stroke-width="1.6"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d="M4 6l4 4 4-4" />
        </svg>
      </summary>
      <div class="mt-2 leading-relaxed text-ink-2">{children}</div>
    </details>
  );
}

export default define.page<typeof handlers>(function About({ data }) {
  const signedIn = Boolean(data.viewerName);
  return (
    <>
      <title>{t("about.pageTitle")}</title>

      <AppHeader
        title={t("nav.about")}
        viewerName={data.viewerName}
        current="about"
        adminUrl={data.adminUrl}
        logoutUrl={data.viewerName ? "/logout" : undefined}
      />

      <main class="mx-auto max-w-2xl px-4 py-10 pb-20">
        <h1 class="text-3xl font-semibold tracking-tight">{t("app.name")}</h1>
        <p class="mt-3 leading-relaxed text-ink-2">
          {t("about.intro")}
        </p>

        <section class="card mt-8 p-6">
          <h2 class="text-lg font-semibold">{t("about.how.title")}</h2>
          <p class="mt-3 leading-relaxed text-ink-2">
            {t("about.how.body")}
          </p>

          <h3 class="mt-6 text-sm font-semibold uppercase tracking-wide text-ink-3">
            {t("about.ways.title")}
          </h3>
          <ul class="mt-3 space-y-3 leading-relaxed text-ink-2">
            <li class="flex gap-3">
              <span
                class="grid size-7 shrink-0 place-items-center rounded-md bg-accent-soft text-sm font-semibold text-accent-2"
                aria-hidden="true"
              >
                1
              </span>
              <p>
                <span class="font-medium text-ink">{t("about.ways.browser.title")}</span>{" "}
                {t("about.ways.browser.body")}
              </p>
            </li>
            <li class="flex gap-3">
              <span
                class="grid size-7 shrink-0 place-items-center rounded-md bg-accent-soft text-sm font-semibold text-accent-2"
                aria-hidden="true"
              >
                2
              </span>
              <p>
                <span class="font-medium text-ink">{t("about.ways.email.title")}</span>{" "}
                {t("about.ways.email.before")} <ProfileLink signedIn={signedIn} />.
              </p>
            </li>
            <li class="flex gap-3">
              <span
                class="grid size-7 shrink-0 place-items-center rounded-md bg-accent-soft text-sm font-semibold text-accent-2"
                aria-hidden="true"
              >
                3
              </span>
              <p>
                <span class="font-medium text-ink">{t("about.ways.feed.title")}</span>{" "}
                {t("about.ways.feed.before")} <ProfileLink signedIn={signedIn} />.
              </p>
            </li>
          </ul>
        </section>

        <section class="mt-10 px-1">
          <h2 class="text-lg font-semibold">{t("about.faq.title")}</h2>
          <div class="mt-2">
            <Faq question={t("about.faq.app.q")}>
              {t("about.faq.app.a")}
            </Faq>
            <Faq question={t("about.faq.firstTime.q")}>
              {t("about.faq.firstTime.a")}
            </Faq>
            <Faq question={t("about.faq.devices.q")}>
              {t("about.faq.devices.a.before")}{" "}
              <span class="font-medium text-ink">{t("landing.login")}</span>
              {t("about.faq.devices.a.after")}
            </Faq>
            <Faq question={t("about.faq.groups.q")}>
              {t("about.faq.groups.a.before")} <ProfileLink signedIn={signedIn} />
              {t("about.faq.groups.a.after")}
            </Faq>
            <Faq question={t("about.faq.calFeed.q")}>
              {t("about.faq.calFeed.a.before")} <ProfileLink signedIn={signedIn} />{" "}
              {t("about.faq.calFeed.a.after")}
            </Faq>
            <Faq question={t("about.faq.monthlyEmail.q")}>
              {t("about.faq.monthlyEmail.a.before")} <ProfileLink signedIn={signedIn} />
              {t("about.faq.monthlyEmail.a.after")}
            </Faq>
            <Faq question={t("about.faq.edit.q")}>
              {t("about.faq.edit.a.before")} <span class="font-medium text-ink">@</span>{" "}
              {t("about.faq.edit.a.after")}
            </Faq>
            <Faq question={t("about.faq.privacy.q")}>
              {t("about.faq.privacy.a")}
            </Faq>
            <Faq question={t("about.faq.data.q")}>
              {t("about.faq.data.a")}
            </Faq>
          </div>
        </section>
      </main>
    </>
  );
});
