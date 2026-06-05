import { CalendarStyles } from "@/components/CalendarStyles.tsx";
import { Calendar } from "@/islands/Calendar.tsx";
import { getStore } from "@/lib/db.ts";
import { calendarViewData } from "@/lib/view_data.ts";
import { define } from "@/utils.ts";
import { page } from "fresh";

export const handlers = define.handlers({
  async GET() {
    return page(await calendarViewData(await getStore()));
  },
});

export default define.page<typeof handlers>(({ data }) => {
  return (
    <>
      <title>Family Calendar</title>
      <script src="https://cdn.tailwindcss.com"></script>
      <CalendarStyles />
      <Calendar {...data} />
    </>
  );
});
