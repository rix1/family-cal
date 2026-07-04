import { BrandMark } from "@/components/AppHeader.tsx";
import { LanguageToggle } from "@/islands/LanguageToggle.tsx";
import { getStore } from "@/lib/db.ts";
import { getEmailSender } from "@/lib/email.ts";
import { t } from "@/lib/i18n.ts";
import { requestLogin } from "@/lib/login.ts";
import { clientKey, RateLimiter } from "@/lib/rate_limit.ts";
import { sessionViewer } from "@/lib/viewer_auth.ts";
import { define } from "@/utils.ts";
import { HttpError, page } from "fresh";

// Bound abuse of this unauthenticated endpoint without blocking a real household
// asking for a couple of links.
const loginLimiter = new RateLimiter({ windowMs: 10 * 60_000, max: 20 });

/** Canonical public origin for emailed links: BASE_URL wins behind a proxy. */
function baseUrl(req: Request): string {
  return Deno.env.get("BASE_URL") ?? new URL(req.url).origin;
}

export const handlers = define.handlers({
  async GET(ctx) {
    const viewer = await sessionViewer(ctx.req, await getStore());
    if (viewer) {
      return new Response(null, { status: 303, headers: { location: "/calendar/" } });
    }
    return page({ submitted: false });
  },
  async POST(ctx) {
    if (!loginLimiter.check(clientKey(ctx.req, ctx.info)).allowed) {
      throw new HttpError(429, t("login.rateLimited"));
    }
    const form = await ctx.req.formData();
    // Always neutral: never reveal whether the email is registered.
    await requestLogin(await getStore(), form.get("email"), baseUrl(ctx.req), getEmailSender());
    return page({ submitted: true });
  },
});

export default define.page<typeof handlers>(({ data }) => (
  <>
    <title>{`${t("login.title")} | ${t("app.name")}`}</title>
    <main class="grid min-h-screen place-items-center px-4 py-12">
      <div class="fixed right-4 top-4">
        <LanguageToggle />
      </div>
      <div class="w-full max-w-md">
        <div class="card p-8">
          <BrandMark />
          {data.submitted
            ? (
              <>
                <p class="kicker mt-8">{t("login.sent.kicker")}</p>
                <h1 class="mt-2 text-2xl font-semibold tracking-tight">{t("login.sent.title")}</h1>
                <p class="mt-3 leading-relaxed text-ink-2">
                  {t("login.sent.body")}
                </p>
                <p class="mt-6 border-t border-line pt-5 text-sm leading-relaxed text-ink-3">
                  {t("login.sent.note")}
                </p>
              </>
            )
            : (
              <>
                <p class="kicker mt-8">{t("login.kicker")}</p>
                <h1 class="mt-2 text-2xl font-semibold tracking-tight">{t("login.title")}</h1>
                <p class="mt-3 leading-relaxed text-ink-2">
                  {t("login.body")}
                </p>
                <form method="post" class="mt-6 grid gap-4">
                  <label class="grid gap-2 text-sm font-medium">
                    {t("login.email")}
                    <input
                      type="email"
                      name="email"
                      required
                      autofocus
                      autocomplete="email"
                      class="input"
                      placeholder={t("login.emailPlaceholder")}
                    />
                  </label>
                  <button type="submit" class="btn btn-primary w-full">
                    {t("login.submit")}
                  </button>
                </form>
                <p class="mt-6 border-t border-line pt-5 text-sm leading-relaxed text-ink-3">
                  {t("login.footer.before")}{" "}
                  <a href="/about" class="font-medium text-accent-2 underline underline-offset-2">
                    {t("login.footer.link")}
                  </a>
                  {t("login.footer.after")}
                </p>
              </>
            )}
        </div>
      </div>
    </main>
  </>
));
