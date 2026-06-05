import { define } from "@/utils.ts";
import { getStore } from "@/lib/db.ts";
import { json } from "@/lib/http.ts";
import { calendarViewData } from "@/lib/view_data.ts";

export const handler = define.handlers({
  async GET() {
    return json(await calendarViewData(await getStore()));
  },
});
