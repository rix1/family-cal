import { CalendarStyles } from "@/components/CalendarStyles.tsx";
import { Calendar } from "@/islands/Calendar.tsx";
import { getStore } from "@/lib/db.ts";
import { calendarViewData } from "@/lib/view_data.ts";
import { define } from "@/utils.ts";
import { page } from "fresh";

export const handlers = define.handlers({
  async GET(ctx) {
    const store = await getStore();
    const viewer = await store.getViewer(ctx.params.token);
    if (!viewer) return new Response("Unknown family calendar link", { status: 404 });
    return page({
      calendar: await calendarViewData(store, viewer.groups),
      editUrl: viewer.canEdit ? `/edit/${viewer.token}` : undefined,
      saveUrl: viewer.canEdit ? `/api/people/${viewer.token}` : undefined,
    });
  },
});

export default define.page<typeof handlers>(({ data }) => {
  return (
    <>
      <title>Family Calendar</title>
      <script src="https://cdn.tailwindcss.com"></script>
      <CalendarStyles />
      <Calendar {...data.calendar} editUrl={data.editUrl} saveUrl={data.saveUrl} />
    </>
  );
});
