import "@/lib/otel.ts";
import { ErrorPage } from "@/components/ErrorPage.tsx";
import { cookieValue } from "@/lib/auth_cookies.ts";
import { LANG_COOKIE, parseLocale, setLocale, t } from "@/lib/i18n.ts";
import type { State } from "@/utils.ts";
import { App, HttpError, page, staticFiles } from "fresh";
import { h } from "preact";

// Tailwind is now built at compile time (no runtime CDN). 'unsafe-inline' covers
// the inline theme script in _app.tsx; 'unsafe-eval' and ws:/wss: keep Vite HMR
// working in dev. Tighten script-src to a nonce once the inline script is removed.
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "connect-src 'self' ws: wss:",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
].join("; ");

export const app = new App<State>()
  .use(async (ctx) => {
    const res = await ctx.next();
    const h = res.headers;
    h.set("Referrer-Policy", "no-referrer");
    h.set("X-Content-Type-Options", "nosniff");
    h.set("X-Frame-Options", "DENY");
    h.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains");
    h.set("Content-Security-Policy", CONTENT_SECURITY_POLICY);
    return res;
  })
  .use(staticFiles())
  .use((ctx) => {
    ctx.state.locale = parseLocale(cookieValue(ctx.req, LANG_COOKIE));
    setLocale(ctx.state.locale); // covers handler-time strings; _app.tsx re-asserts at render time
    return ctx.next();
  })
  .notFound({
    handler: () => page(null, { status: 404 }),
    component: () =>
      h(ErrorPage, {
        status: 404,
        title: t("error.notFound.title"),
        message: t("error.notFound.message"),
      }),
  })
  .onError("*", {
    handler: (ctx) => {
      const status = ctx.error instanceof HttpError ? ctx.error.status : 500;
      return page(null, { status });
    },
    component: ({ error }) => {
      const status = error instanceof HttpError ? error.status : 500;
      const expired = status === 410;
      return h(ErrorPage, {
        status,
        title: expired
          ? t("error.expired.title")
          : status === 404
          ? t("error.notFound.title")
          : t("error.generic.title"),
        message: expired && error instanceof Error
          ? error.message
          : status === 404 && error instanceof Error && error.message
          ? error.message
          : status === 404
          ? t("error.notFound.message")
          : t("error.generic.message"),
      });
    },
  })
  .fsRoutes();

if (import.meta.main) {
  app.listen();
}
