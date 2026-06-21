import { AdminShell } from "@/components/AdminShell.tsx";
import { adminDenied, adminViewer } from "@/lib/admin_auth.ts";
import { getStore } from "@/lib/db.ts";
import { eventKindLabels, normalizeEvent } from "@/lib/family_events.ts";
import { EVENT_KINDS } from "@/lib/model.ts";
import { ValidationError } from "@/lib/people.ts";
import { MentionTextarea } from "@/islands/MentionTextarea.tsx";
import { Toast } from "@/islands/Toast.tsx";
import { define } from "@/utils.ts";
import { HttpError, page } from "fresh";

export const handlers = define.handlers({
  async GET(ctx) {
    const store = await getStore();
    const viewer = await adminViewer(ctx.req, store);
    if (!viewer) return adminDenied();
    const [events, people, groups] = await Promise.all([
      store.listEvents(),
      store.listPeople(),
      store.listGroups(),
    ]);
    return page({
      viewer,
      groups,
      mentionPeople: people
        .map((person) => ({ id: person.id, name: person.name }))
        .sort((a, b) => a.name.localeCompare(b.name)),
      events: events.sort((a, b) => a.date.slice(-5).localeCompare(b.date.slice(-5))),
      saved: ctx.url.searchParams.get("saved") === "1",
      deleted: ctx.url.searchParams.get("deleted") === "1",
    });
  },
  async POST(ctx) {
    const store = await getStore();
    const viewer = await adminViewer(ctx.req, store);
    if (!viewer) return adminDenied();
    const form = await ctx.req.formData();

    if (form.get("action") === "delete") {
      const id = String(form.get("id") ?? "");
      const event = await store.getEvent(id);
      if (!event) throw new HttpError(404, "Event was not found.");
      await store.deleteEvent(id);
      await store.appendAudit({
        at: new Date().toISOString(),
        actor: viewer.name,
        action: "delete_event",
        targetId: id,
        detail: `Deleted ${event.kind} "${event.title}" on ${event.date}`,
      });
      return new Response(null, {
        status: 303,
        headers: { location: "/admin/events/?deleted=1" },
      });
    }

    const knownGroups = new Set((await store.listGroups()).map((group) => group.key));
    let event;
    try {
      event = normalizeEvent({
        kind: String(form.get("kind") ?? ""),
        title: String(form.get("title") ?? ""),
        date: String(form.get("date") ?? "").trim(),
        groups: form.getAll("groups").map(String),
        notes: String(form.get("notes") ?? ""),
      }, knownGroups);
    } catch (error) {
      if (error instanceof ValidationError) throw new HttpError(400, error.message);
      throw error;
    }
    await store.upsertEvent(event);
    await store.appendAudit({
      at: new Date().toISOString(),
      actor: viewer.name,
      action: "create_event",
      targetId: event.id,
      detail: `Added ${event.kind} "${event.title}" on ${event.date}`,
    });
    return new Response(null, {
      status: 303,
      headers: { location: "/admin/events/?saved=1" },
    });
  },
});

export default define.page<typeof handlers>(({ data }) => {
  const groupLabel = (key: string) => data.groups.find((group) => group.key === key)?.label ?? key;
  return (
    <>
      <title>Events | Family Calendar Admin</title>
      <AdminShell
        current="events"
        viewerName={data.viewer.name}
        calendarUrl="/calendar/"
      >
        <div class="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 class="text-2xl font-semibold tracking-tight">Events</h1>
            <p class="mt-1 max-w-2xl text-sm text-ink-2">
              Weddings, baptisms, and other dates beyond birthdays. Every event repeats yearly;
              groups decide who sees it.
            </p>
          </div>
          <details class="relative">
            <summary class="btn btn-primary cursor-pointer list-none [&::-webkit-details-marker]:hidden">
              Add event
            </summary>
            <form
              method="post"
              class="card absolute right-0 z-30 mt-2 grid w-[min(24rem,calc(100vw-2rem))] gap-4 p-4 shadow-pop"
            >
              <label class="grid gap-1.5 text-sm font-medium">
                Kind
                <select name="kind" class="input">
                  {EVENT_KINDS.map((kind) => <option value={kind}>{eventKindLabels[kind]}</option>)}
                </select>
              </label>
              <label class="grid gap-1.5 text-sm font-medium">
                Title
                <input
                  name="title"
                  required
                  placeholder="Bryllupsdag"
                  class="input"
                />
              </label>
              <label class="grid gap-1.5 text-sm font-medium">
                Date
                <input
                  name="date"
                  required
                  placeholder="1992-06-27 or 06-27"
                  class="input tabular-nums"
                />
                <span class="text-xs font-normal text-ink-3">
                  Use MM-DD when the year is unknown. The event repeats every year.
                </span>
              </label>
              <fieldset>
                <legend class="text-sm font-medium">Groups</legend>
                <p class="mt-1 text-xs text-ink-3">
                  Who sees this event. Pick one or several.
                </p>
                <div class="mt-2 grid gap-2 sm:grid-cols-2">
                  {data.groups.map((group) => (
                    <label class="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        name="groups"
                        value={group.key}
                        class="accent-accent"
                      />
                      <span>{group.label}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
              <div class="grid gap-1.5 text-sm font-medium">
                Notes (optional)
                <MentionTextarea
                  name="notes"
                  people={data.mentionPeople}
                  rows={2}
                  placeholder="@halvor og @solveig giftet seg på Hamar!"
                />
              </div>
              <button type="submit" class="btn btn-primary">
                Add event
              </button>
            </form>
          </details>
        </div>

        {data.saved && <Toast message="Event added." />}
        {data.deleted && <Toast message="Event deleted." />}

        <div class="card mt-8 overflow-x-auto">
          <table class="data-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Event</th>
                <th>Kind</th>
                <th>Groups</th>
                <th>Notes</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {data.events.map((event) => (
                <tr>
                  <td class="whitespace-nowrap font-mono text-xs text-ink-2">{event.date}</td>
                  <td class="font-medium">{event.title}</td>
                  <td>
                    <span class="badge bg-inset text-ink-2">
                      {eventKindLabels[event.kind]}
                    </span>
                  </td>
                  <td class="text-ink-2">
                    {event.groups.map(groupLabel).join(", ")}
                  </td>
                  <td class="text-ink-2">{event.notes}</td>
                  <td class="text-right">
                    <form method="post">
                      <input type="hidden" name="action" value="delete" />
                      <input type="hidden" name="id" value={event.id} />
                      <button type="submit" class="btn btn-danger btn-sm">
                        Delete
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!data.events.length && (
            <p class="px-4 py-8 text-center text-sm text-ink-3">
              No events yet. Add a wedding or baptism to get started.
            </p>
          )}
        </div>
      </AdminShell>
    </>
  );
});
