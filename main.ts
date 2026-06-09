import { ErrorPage } from "@/components/ErrorPage.tsx";
import type { State } from "@/utils.ts";
import { App, HttpError, page, staticFiles } from "fresh";
import { h } from "preact";

// Compatible with the current inline theme script and the Tailwind CDN (#7).
// Tighten script-src to a nonce/self once the CDN and inline scripts are removed.
// `ws:`/`wss:` keep Vite HMR working in dev.
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.tailwindcss.com",
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
  .notFound({
    handler: () => page(null, { status: 404 }),
    component: () =>
      h(ErrorPage, {
        status: 404,
        title: "Page not found",
        message: "This page does not exist, or the link is no longer available.",
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
          ? "Link expired"
          : status === 404
          ? "Page not found"
          : "Something went wrong",
        message: expired && error instanceof Error
          ? error.message
          : status === 404 && error instanceof Error && error.message
          ? error.message
          : status === 404
          ? "This page does not exist, or the link is no longer available."
          : "The family calendar could not complete this request. Please try again.",
      });
    },
  })
  .fsRoutes();

if (import.meta.main) {
  app.listen();
}
