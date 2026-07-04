import { Calendar } from "@/islands/Calendar.tsx";
import { WelcomeTour } from "@/islands/WelcomeTour.tsx";
import { ensureFeedToken } from "@/lib/access_links.ts";
import { getStore } from "@/lib/db.ts";
import { sessionViewer } from "@/lib/viewer_auth.ts";
import { calendarViewData } from "@/lib/view_data.ts";
import { define } from "@/utils.ts";
import { HttpError, page } from "fresh";

export const handlers = define.handlers({
  async GET(ctx) {
    const store = await getStore();
    const viewer = await sessionViewer(ctx.req, store);
    if (!viewer) throw new HttpError(404, "This calendar requires a family access link.");
    const calendar = await calendarViewData(store, viewer.groups);
    // The welcome tour shows once: fresh signups land here with ?welcome=1,
    // and finishing (or skipping) it stamps `welcomedAt` on the viewer.
    const showWelcome = ctx.url.searchParams.get("welcome") === "1" && !viewer.welcomedAt;
    const baseUrl = Deno.env.get("BASE_URL") ?? ctx.url.origin;
    return page({
      calendar,
      viewerName: viewer.name,
      editUrl: viewer.canEdit ? "/admin/" : undefined,
      saveUrl: viewer.canEdit ? `/api/people/${viewer.token}` : undefined,
      eventsSaveUrl: viewer.canEdit ? `/api/events/${viewer.token}` : undefined,
      subscribed: Boolean(viewer.newsletter),
      followedGroups: viewer.groups,
      welcome: showWelcome
        ? {
          feedUrl: `${baseUrl}/cal/${await ensureFeedToken(store, viewer)}.ics`,
          hasEmail: Boolean(viewer.email),
          canEdit: viewer.canEdit,
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
      logoutUrl="/logout"
    />
    {data.welcome && (
      <WelcomeTour
        viewerName={data.viewerName}
        feedUrl={data.welcome.feedUrl}
        hasEmail={data.welcome.hasEmail}
        canEdit={data.welcome.canEdit}
        subscribed={data.subscribed}
        groups={data.calendar.groups}
        followedGroups={data.followedGroups}
      />
    )}
  </>
));
