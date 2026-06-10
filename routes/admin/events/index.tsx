import { AdminShell } from "@/components/AdminShell.tsx";
import { adminDenied, adminViewer } from "@/lib/admin_auth.ts";
import { getStore } from "@/lib/db.ts";
import { eventKindLabels, eventTitle, normalizeEvent } from "@/lib/family_events.ts";
import { EVENT_KINDS } from "@/lib/model.ts";
import { ValidationError } from "@/lib/people.ts";
import { define } from "@/utils.ts";
import { HttpError, page } from "fresh";

export const handlers = define.handlers({
  async GET(ctx) {
    const store = await getStore();
    const viewer = await adminViewer(ctx.req, store);
    if (!viewer) return adminDenied();
    const [events, people] = await Promise.all([store.listEvents(), store.listPeople()]);
    return page({
      viewer,
      people: people.sort((a, b) => a.name.localeCompare(b.name)),
      events: events
        .map((event) => ({ ...event, title: eventTitle(event, people) }))
        .sort((a, b) => a.date.slice(-5).localeCompare(b.date.slice(-5))),
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
        detail: `Deleted ${event.kind} on ${event.date}`,
      });
      return new Response(null, {
        status: 303,
        headers: { location: "/admin/events/?deleted=1" },
      });
    }

    const knownPeople = new Set((await store.listPeople()).map((person) => person.id));
    let event;
    try {
      event = normalizeEvent({
        kind: String(form.get("kind") ?? ""),
        title: String(form.get("title") ?? ""),
        date: String(form.get("date") ?? "").trim(),
        subjects: form.getAll("subjects").map(String),
        notes: String(form.get("notes") ?? ""),
      }, knownPeople);
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
      detail: `Added ${event.kind} on ${event.date}`,
    });
    return new Response(null, {
      status: 303,
      headers: { location: "/admin/events/?saved=1" },
    });
  },
});

export default define.page<typeof handlers>(({ data }) => (
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
            Weddings, baptisms, and other dates beyond birthdays. Every event repeats yearly.
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
              <legend class="text-sm font-medium">People</legend>
              <div class="mt-2 grid max-h-44 gap-1 overflow-y-auto rounded-lg border border-line p-2 sm:grid-cols-2">
                {data.people.map((person) => (
                  <label class="flex items-center gap-2 rounded px-1 py-0.5 text-sm">
                    <input
                      type="checkbox"
                      name="subjects"
                      value={person.id}
                      class="accent-accent"
                    />
                    <span class="truncate">{person.name}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            <label class="grid gap-1.5 text-sm font-medium">
              Title (optional)
              <input
                name="title"
                placeholder="Defaults to the selected names"
                class="input"
              />
            </label>
            <label class="grid gap-1.5 text-sm font-medium">
              Notes (optional)
              <textarea name="notes" rows={2} class="input resize-y" />
            </label>
            <button type="submit" class="btn btn-primary">
              Add event
            </button>
          </form>
        </details>
      </div>

      {data.saved && (
        <p class="mt-6 rounded-xl border border-accent/40 bg-accent-soft px-4 py-3 text-sm font-medium text-accent-2">
          Event added.
        </p>
      )}
      {data.deleted && (
        <p class="mt-6 rounded-xl border border-accent/40 bg-accent-soft px-4 py-3 text-sm font-medium text-accent-2">
          Event deleted.
        </p>
      )}

      <div class="card mt-8 overflow-x-auto">
        <table class="data-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Event</th>
              <th>Kind</th>
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
));
