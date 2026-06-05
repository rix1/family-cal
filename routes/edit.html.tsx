import { Editor } from "@/islands/Editor.tsx";
import { getStore } from "@/lib/db.ts";
import { define } from "@/utils.ts";
import { page } from "fresh";

export const handlers = define.handlers({
  async GET() {
    const store = await getStore();
    const [groups, people] = await Promise.all([store.listGroups(), store.listPeople()]);
    return page({ groups, people });
  },
});

export default define.page<typeof handlers>(({ data }) => {
  return (
    <>
      <title>Edit Family Dates</title>
      <script src="https://cdn.tailwindcss.com"></script>
      <div class="min-h-screen bg-zinc-50 text-zinc-950">
        <Editor groups={data.groups} people={data.people} />
      </div>
    </>
  );
});
