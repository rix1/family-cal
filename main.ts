import { ErrorPage } from "@/components/ErrorPage.tsx";
import type { State } from "@/utils.ts";
import { App, HttpError, page, staticFiles } from "fresh";
import { h } from "preact";

export const app = new App<State>()
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
