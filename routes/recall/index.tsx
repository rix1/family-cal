import { AppHeader } from "@/components/AppHeader.tsx";
import { Recall } from "@/islands/Recall.tsx";
import { getStore } from "@/lib/db.ts";
import { t } from "@/lib/i18n.ts";
import { sessionViewer } from "@/lib/viewer_auth.ts";
import { calendarViewData } from "@/lib/view_data.ts";
import { define } from "@/utils.ts";
import { HttpError, page } from "fresh";

export const handlers = define.handlers({
  async GET(ctx) {
    const store = await getStore();
    const viewer = await sessionViewer(ctx.req, store);
    if (!viewer) throw new HttpError(404, t("error.requiresLink"));
    const data = await calendarViewData(store, viewer.groups);
    return page({
      people: data.people,
      viewerName: viewer.name,
      adminUrl: viewer.canEdit ? "/admin/" : undefined,
    });
  },
});

export default define.page<typeof handlers>(({ data }) => (
  <>
    <title>{`${t("recall.title")} | ${t("app.name")}`}</title>
    <div class="min-h-screen">
      <AppHeader
        title={t("recall.title")}
        viewerName={data.viewerName}
        adminUrl={data.adminUrl}
        logoutUrl="/logout"
      />
      <main class="mx-auto max-w-2xl px-4 pb-20 pt-8">
        <h1 class="text-2xl font-semibold tracking-tight">{t("recall.title")}</h1>
        <p class="mt-2 leading-relaxed text-ink-2">
          {t("recall.intro")}
        </p>
        <div class="mt-6">
          <Recall people={data.people} calendarUrl="/calendar/" />
        </div>
      </main>
    </div>
  </>
));
