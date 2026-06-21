import { AdminShell } from "@/components/AdminShell.tsx";
import { adminCookie, adminDenied, adminViewer } from "@/lib/admin_auth.ts";
import { MONTH_NAMES, pad2 } from "@/lib/dates.ts";
import { getStore } from "@/lib/db.ts";
import { viewerIsActive } from "@/lib/model.ts";
import { osloToday } from "@/lib/newsletter.ts";
import { familyStats } from "@/lib/stats.ts";
import { viewerCookie } from "@/lib/viewer_auth.ts";
import { define } from "@/utils.ts";
import { HttpError, page } from "fresh";

export const handlers = define.handlers({
  async GET(ctx) {
    const store = await getStore();
    const token = ctx.url.searchParams.get("token");
    if (token) {
      const viewer = await store.getViewer(token);
      if (viewer && !viewerIsActive(viewer)) {
        throw new HttpError(410, "This family access link has expired. Ask for a new one.");
      }
      if (!viewer?.canEdit) return adminDenied();
      const headers = new Headers({ location: "/admin/" });
      headers.append("set-cookie", adminCookie(token));
      headers.append("set-cookie", viewerCookie(token));
      return new Response(null, { status: 303, headers });
    }

    const viewer = await adminViewer(ctx.req, store);
    if (!viewer) return adminDenied();
    const [people, groups, viewers, invites] = await Promise.all([
      store.listPeople(),
      store.listGroups(),
      store.listViewers(),
      store.listInvites(),
    ]);
    const t = osloToday();
    return page({
      viewer,
      counts: {
        people: people.length,
        groups: groups.length,
        viewers: viewers.length,
        invites: invites.length,
      },
      stats: familyStats(people, viewers, `${t.year}-${pad2(t.month)}-${pad2(t.day)}`),
    });
  },
});

export default define.page<typeof handlers>(({ data }) => (
  <>
    <title>Administration | Family Calendar</title>
    <AdminShell
      current="home"
      viewerName={data.viewer.name}
      calendarUrl="/calendar/"
    >
      <h1 class="text-2xl font-semibold tracking-tight">Administration</h1>
      <p class="mt-1 text-sm text-ink-2">Manage the family calendar's stored data.</p>
      <div class="mt-8 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Object.entries(data.counts).map(([label, count]) => (
          <div class="card p-5">
            <p class="kicker capitalize">{label}</p>
            <p class="mt-2 text-3xl font-semibold tabular-nums tracking-tight">{count}</p>
          </div>
        ))}
      </div>

      <h2 class="mt-10 text-lg font-semibold tracking-tight">Family insights</h2>
      <p class="mt-1 text-sm text-ink-2">
        Inferred from stored data. Age figures cover the members with a full birth date.
      </p>
      <div class="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <div class="card p-5">
          <p class="kicker">Average age</p>
          <p class="mt-2 text-3xl font-semibold tabular-nums tracking-tight">
            {data.stats.averageAge ?? "—"}
          </p>
          <p class="mt-1 text-xs text-ink-3">
            {data.stats.living} living · {data.stats.birthDatesKnown} with a birth year
          </p>
        </div>

        <div class="card p-5">
          <p class="kicker">Living</p>
          <p class="mt-2 text-3xl font-semibold tabular-nums tracking-tight">
            {data.stats.living}
          </p>
          <p class="mt-1 text-xs text-ink-3">{data.stats.inMemory} in memory</p>
        </div>

        <div class="card p-5">
          <p class="kicker">Age range</p>
          {data.stats.oldest && data.stats.youngest
            ? (
              <div class="mt-2 space-y-1 text-sm">
                <p>
                  <span class="font-semibold tabular-nums">{data.stats.oldest.age}</span>{" "}
                  {data.stats.oldest.name} <span class="text-ink-3">· oldest</span>
                </p>
                <p>
                  <span class="font-semibold tabular-nums">{data.stats.youngest.age}</span>{" "}
                  {data.stats.youngest.name} <span class="text-ink-3">· youngest</span>
                </p>
              </div>
            )
            : <p class="mt-2 text-sm text-ink-3">Needs birth years.</p>}
        </div>

        <div class="card p-5">
          <p class="kicker">Busiest birth month</p>
          <p class="mt-2 text-3xl font-semibold tracking-tight">
            {data.stats.busiestMonth ? MONTH_NAMES[data.stats.busiestMonth.month - 1] : "—"}
          </p>
          <p class="mt-1 text-xs text-ink-3">
            {data.stats.busiestMonth
              ? `${data.stats.busiestMonth.count} ${
                data.stats.busiestMonth.count === 1 ? "birthday" : "birthdays"
              }`
              : "No birth dates yet"}
          </p>
        </div>

        <div class="card p-5">
          <p class="kicker">Birthdays known</p>
          <p class="mt-2 text-3xl font-semibold tabular-nums tracking-tight">
            {data.stats.birthDatesKnown}
            <span class="font-normal text-ink-3">/{data.stats.totalPeople}</span>
          </p>
          <p class="mt-1 text-xs text-ink-3">have a full birth date</p>
        </div>

        <div class="card p-5">
          <p class="kicker">Newsletter</p>
          <p class="mt-2 text-3xl font-semibold tabular-nums tracking-tight">
            {data.stats.subscribers}
          </p>
          <p class="mt-1 text-xs text-ink-3">
            of {data.stats.activeViewers} active{" "}
            {data.stats.activeViewers === 1 ? "viewer" : "viewers"}
          </p>
        </div>

        <div class="card p-5 sm:col-span-2 xl:col-span-3">
          <p class="kicker">Same age</p>
          <p class="mt-1 text-xs text-ink-3">Living members who share an age.</p>
          {data.stats.sameAge.length
            ? (
              <ul class="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {data.stats.sameAge.map((group) => (
                  <li class="flex items-baseline gap-3 rounded-lg bg-inset px-3 py-2">
                    <span class="shrink-0 text-lg font-semibold tabular-nums">
                      {group.age} years
                    </span>
                    <span class="text-sm text-ink-2">{group.names.join(", ")}</span>
                  </li>
                ))}
              </ul>
            )
            : <p class="mt-3 text-sm text-ink-3">No two members share an age yet.</p>}
        </div>
      </div>
    </AdminShell>
  </>
));
