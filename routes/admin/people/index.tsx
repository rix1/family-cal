import { AdminShell } from "@/components/AdminShell.tsx";
import { Editor } from "@/islands/Editor.tsx";
import { adminDenied, adminViewer } from "@/lib/admin_auth.ts";
import { getStore } from "@/lib/db.ts";
import { define } from "@/utils.ts";
import { page } from "fresh";

export const handlers = define.handlers({
  async GET(ctx) {
    const store = await getStore();
    const viewer = await adminViewer(ctx.req, store);
    if (!viewer) return adminDenied();
    const [groups, people] = await Promise.all([store.listGroups(), store.listPeople()]);
    return page({
      groups,
      people,
      viewer,
      focusPersonId: ctx.url.searchParams.get("person") ?? "",
    });
  },
});

export default define.page<typeof handlers>(({ data }) => (
  <>
    <title>People | Family Calendar Admin</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <AdminShell current="people" viewerName={data.viewer.name}>
      <Editor
        groups={data.groups}
        people={data.people}
        viewerName={data.viewer.name}
        calendarUrl={`/view/${data.viewer.token}`}
        saveUrl={`/api/people/${data.viewer.token}`}
        focusPersonId={data.focusPersonId}
        embedded
      />
    </AdminShell>
  </>
));
