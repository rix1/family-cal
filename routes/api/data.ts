import { define } from "@/utils.ts";
import { getStore } from "@/lib/db.ts";
import { holidaysForYears } from "@/lib/holidays.ts";
import { json } from "@/lib/http.ts";

export const handler = define.handlers({
  async GET() {
    const store = await getStore();
    const [groups, people] = await Promise.all([
      store.listGroups(),
      store.listPeople(),
    ]);
    const year = new Date().getFullYear();
    // Wide enough for the virtual timeline; still tiny JSON (~15 holidays/year).
    const holidays = holidaysForYears(year - 5, year + 50).map((h) => ({
      date: `${h.date.year}-${String(h.date.month).padStart(2, "0")}-${
        String(
          h.date.day,
        ).padStart(2, "0")
      }`,
      name: h.name,
      countries: h.countries,
    }));
    return json({ groups, people, holidays });
  },
});
