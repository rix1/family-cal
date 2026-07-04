import { BrandMark } from "@/components/AppHeader.tsx";
import { LanguageToggle } from "@/islands/LanguageToggle.tsx";
import { getStore } from "@/lib/db.ts";
import { t } from "@/lib/i18n.ts";
import { sessionViewer } from "@/lib/viewer_auth.ts";
import { define } from "@/utils.ts";
import { page } from "fresh";

export const handlers = define.handlers({
  async GET(ctx) {
    const viewer = await sessionViewer(ctx.req, await getStore());
    if (viewer) {
      return new Response(null, { status: 303, headers: { location: "/calendar/" } });
    }
    return page({});
  },
});

export default define.page<typeof handlers>(function AccessRequired() {
  return (
    <>
      <title>{t("app.name")}</title>
      <main class="grid min-h-screen place-items-center px-4 py-12">
        <div class="fixed right-4 top-4">
          <LanguageToggle />
        </div>
        <div class="w-full max-w-md">
          <div class="card p-8">
            <BrandMark />
            <p class="kicker mt-8">{t("landing.kicker")}</p>
            <h1 class="mt-2 text-2xl font-semibold tracking-tight">{t("app.name")}</h1>
            <p class="mt-3 leading-relaxed text-ink-2">
              {t("landing.tagline")}
            </p>
            <a href="/login" class="btn btn-primary mt-6 w-full">
              {t("landing.login")}
            </a>
            <p class="mt-6 border-t border-line pt-5 text-sm leading-relaxed text-ink-3">
              {t("landing.footer.before")}{" "}
              <a href="/about" class="font-medium text-accent-2 underline underline-offset-2">
                {t("landing.footer.link")}
              </a>
              {t("landing.footer.after")}
            </p>
          </div>
        </div>
      </main>
    </>
  );
});
