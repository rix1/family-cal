import { Calendar } from "@/islands/Calendar.tsx";
import { WelcomeTour } from "@/islands/WelcomeTour.tsx";
import { ensureFeedToken } from "@/lib/access_links.ts";
import { getStore } from "@/lib/db.ts";
import { ownPersonalGroup } from "@/lib/groups.ts";
import { t } from "@/lib/i18n.ts";
import { sessionViewer } from "@/lib/viewer_auth.ts";
import { calendarViewData } from "@/lib/view_data.ts";
import { define } from "@/utils.ts";
import { HttpError, page } from "fresh";

export const handlers = define.handlers({
  async GET(ctx) {
    const store = await getStore();
    const viewer = await sessionViewer(ctx.req, store);
    if (!viewer) throw new HttpError(404, t("calendar.error.requiresLink"));
    const calendar = await calendarViewData(store, viewer.groups);
    const ownList = ownPersonalGroup(await store.listGroups(), viewer.email);
    // The welcome tour shows on the first visit — however the viewer got their
    // link (invite or admin-issued) — until finishing/skipping stamps
    // `welcomedAt`. ?welcome=1 (the "Show welcome tour" menu item) replays it.
    const showWelcome = !viewer.welcomedAt || ctx.url.searchParams.get("welcome") === "1";
    const baseUrl = Deno.env.get("BASE_URL") ?? ctx.url.origin;
    return page({
      calendar,
      viewerName: viewer.name,
      editUrl: viewer.isAdmin ? "/admin/" : undefined,
      saveUrl: `/api/people/${viewer.token}`,
      eventsSaveUrl: `/api/events/${viewer.token}`,
      subscribed: Boolean(viewer.newsletter),
      followedGroups: viewer.groups,
      personalKey: ownList?.key ?? null,
      checklistDismissed: Boolean(viewer.checklistDismissedAt),
      welcome: showWelcome
        ? {
          feedUrl: `${baseUrl}/cal/${await ensureFeedToken(store, viewer)}.ics`,
          hasEmail: Boolean(viewer.email),
        }
        : null,
    });
  },
});

export default define.page<typeof handlers>(({ data }) => (
  <>
    <title>Family Calendar</title>
    <Calendar
      {...data.calendar}
      viewerName={data.viewerName}
      editUrl={data.editUrl}
      saveUrl={data.saveUrl}
      eventsSaveUrl={data.eventsSaveUrl}
      subscribed={data.subscribed}
      followedGroups={data.followedGroups}
      personalKey={data.personalKey}
      checklistDismissed={data.checklistDismissed}
      logoutUrl="/logout"
    />
    {data.welcome && (
      <WelcomeTour
        viewerName={data.viewerName}
        feedUrl={data.welcome.feedUrl}
        hasEmail={data.welcome.hasEmail}
        subscribed={data.subscribed}
        groups={data.calendar.groups}
        followedGroups={data.followedGroups}
      />
    )}
  </>
));
