import { Calendar } from "@/islands/Calendar.tsx";
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
    return page({
      calendar: await calendarViewData(store, viewer.groups),
      viewerName: viewer.name,
      editUrl: viewer.canEdit ? "/admin/" : undefined,
      saveUrl: viewer.canEdit ? `/api/people/${viewer.token}` : undefined,
      subscribed: Boolean(viewer.newsletter),
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
      subscribed={data.subscribed}
      logoutUrl="/logout"
    />
  </>
));
