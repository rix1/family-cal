import { Editor } from "@/islands/Editor.tsx";
import { getStore } from "@/lib/db.ts";
import { define } from "@/utils.ts";
import { page } from "fresh";

export const handlers = define.handlers({
  async GET(ctx) {
    const store = await getStore();
    const viewer = await store.getViewer(ctx.params.token);
    if (!viewer?.canEdit) return new Response("Unknown editor link", { status: 404 });
    const [groups, people] = await Promise.all([store.listGroups(), store.listPeople()]);
    return page({
      groups,
      people,
      viewer,
      focusPersonId: ctx.url.searchParams.get("person") ?? "",
    });
  },
});

export default define.page<typeof handlers>(({ data }) => {
  return (
    <>
      <title>Edit Family Dates</title>
      <script src="https://cdn.tailwindcss.com"></script>
      <div class="min-h-screen bg-zinc-50 text-zinc-950">
        <Editor
          groups={data.groups}
          people={data.people}
          viewerName={data.viewer.name}
          calendarUrl={`/view/${data.viewer.token}`}
          saveUrl={`/api/people/${data.viewer.token}`}
          focusPersonId={data.focusPersonId}
        />
      </div>
    </>
  );
});
