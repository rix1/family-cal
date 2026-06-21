import { AdminShell } from "@/components/AdminShell.tsx";
import { Toast } from "@/islands/Toast.tsx";
import { adminDenied, adminViewer } from "@/lib/admin_auth.ts";
import { getStore } from "@/lib/db.ts";
import {
  activeSubscribers,
  addMonths,
  clearNewsletterPreference,
  deleteDraft,
  generateDraftsForMonth,
  missingSegments,
  monthKey,
  type MonthRef,
  osloToday,
  parseMonthKey,
  segmentKey,
  subscriberSegments,
} from "@/lib/newsletter.ts";
import { ValidationError } from "@/lib/people.ts";
import { define } from "@/utils.ts";
import { HttpError, page } from "fresh";

function monthIndex(ref: MonthRef): number {
  return ref.year * 12 + ref.month - 1;
}

function currentOsloMonth(): MonthRef {
  const today = osloToday();
  return { year: today.year, month: today.month };
}

export const handlers = define.handlers({
  async GET(ctx) {
    const store = await getStore();
    const viewer = await adminViewer(ctx.req, store);
    if (!viewer) return adminDenied();
    const [viewers, drafts] = await Promise.all([
      store.listViewers(),
      store.listNewsletterDrafts(),
    ]);
    const subscribers = activeSubscribers(viewers)
      .sort((a, b) => a.name.localeCompare(b.name));
    const current = currentOsloMonth();
    return page({
      viewer,
      subscribers: subscribers.map((subscriber) => ({
        token: subscriber.token,
        name: subscriber.name,
        email: subscriber.newsletter!.email,
        segment: segmentKey(subscriber.newsletter!.groups),
      })),
      segments: subscriberSegments(viewers).map((segment) => ({
        key: segment.key,
        subscriberCount: segment.subscribers.length,
      })),
      drafts: drafts.sort((a, b) =>
        b.month.localeCompare(a.month) || a.segment.localeCompare(b.segment)
      ),
      missing: (await missingSegments(store, current)).map((segment) => segment.key),
      currentMonth: monthKey(current),
      monthMin: monthKey(current),
      monthMax: monthKey(addMonths(current, 12)),
      generated: ctx.url.searchParams.get("generated"),
      deleted: ctx.url.searchParams.get("deleted") === "1",
      unsubscribed: ctx.url.searchParams.get("unsubscribed") === "1",
    });
  },
  async POST(ctx) {
    const store = await getStore();
    const viewer = await adminViewer(ctx.req, store);
    if (!viewer) return adminDenied();
    const form = await ctx.req.formData();
    const action = String(form.get("action") ?? "");

    if (action === "generate") {
      const month = parseMonthKey(String(form.get("month") ?? ""));
      if (!month) throw new HttpError(400, "Pick a month to generate drafts for.");
      const current = currentOsloMonth();
      const offset = monthIndex(month) - monthIndex(current);
      if (offset < 0 || offset > 12) {
        throw new HttpError(400, "Drafts can cover the current month through twelve months ahead.");
      }
      const created = await generateDraftsForMonth(store, month, viewer.name);
      return new Response(null, {
        status: 303,
        headers: { location: `/admin/newsletters/?generated=${created.length}` },
      });
    }

    if (action === "delete") {
      const id = String(form.get("id") ?? "");
      try {
        await deleteDraft(store, id, viewer.name);
      } catch (error) {
        if (error instanceof ValidationError) throw new HttpError(400, error.message);
        throw error;
      }
      return new Response(null, {
        status: 303,
        headers: { location: "/admin/newsletters/?deleted=1" },
      });
    }

    if (action === "unsubscribe") {
      const token = String(form.get("token") ?? "");
      const subscriber = await store.getViewer(token);
      if (!subscriber) throw new HttpError(400, "Subscriber not found.");
      await clearNewsletterPreference(store, subscriber, viewer.name);
      return new Response(null, {
        status: 303,
        headers: { location: "/admin/newsletters/?unsubscribed=1" },
      });
    }

    throw new HttpError(400, "Unknown newsletter action.");
  },
});

export default define.page<typeof handlers>(({ data }) => (
  <>
    <title>Newsletters | Family Calendar Admin</title>
    <AdminShell
      current="newsletters"
      viewerName={data.viewer.name}
      calendarUrl="/calendar/"
    >
      <div class="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 class="text-2xl font-semibold tracking-tight">Newsletters</h1>
          <p class="mt-1 max-w-2xl text-sm text-ink-2">
            Monthly birthday emails in Norwegian. Drafts are prepared here per audience segment; you
            copy the result into your own email client and send it with BCC.
          </p>
        </div>
        {data.segments.length
          ? (
            <details class="relative">
              <summary class="btn btn-primary cursor-pointer list-none [&::-webkit-details-marker]:hidden">
                Generate drafts
              </summary>
              <form
                method="post"
                class="card absolute right-0 z-30 mt-2 grid w-[min(20rem,calc(100vw-2rem))] gap-4 p-4 shadow-pop"
              >
                <input type="hidden" name="action" value="generate" />
                <label class="grid gap-1.5 text-sm font-medium">
                  Month
                  <input
                    type="month"
                    name="month"
                    required
                    min={data.monthMin}
                    max={data.monthMax}
                    value={data.monthMin}
                    class="input"
                  />
                  <span class="text-xs font-normal text-ink-3">
                    One draft per subscriber segment with birthdays. Running this again for a month
                    that already has drafts adds more — delete unwanted ones instead.
                  </span>
                </label>
                <button type="submit" class="btn btn-primary">
                  Generate
                </button>
              </form>
            </details>
          )
          : (
            <button
              type="button"
              disabled
              title="No one has subscribed to the newsletter yet — ask a viewer to subscribe under their account menu first."
              class="btn btn-primary"
            >
              Generate drafts
            </button>
          )}
      </div>

      {data.generated !== null && (
        <Toast
          message={data.generated === "0"
            ? "No segment has birthdays for that month yet."
            : `Generated ${data.generated} draft${data.generated === "1" ? "" : "s"}.`}
        />
      )}
      {data.deleted && <Toast message="Newsletter deleted." />}
      {data.unsubscribed && <Toast message="Subscriber removed." />}
      {Boolean(data.missing.length) && (
        <p class="mt-6 rounded-xl border border-gold/40 bg-gold-soft px-4 py-3 text-sm font-medium text-gold">
          A newsletter for {data.currentMonth}{" "}
          has not been created for segment{data.missing.length === 1 ? "" : "s"}
          : {data.missing.join(", ")}.
        </p>
      )}

      <section class="card mt-8 overflow-x-auto">
        <div class="flex items-baseline justify-between gap-3 px-4 pt-4">
          <h2 class="text-lg font-semibold">Drafts</h2>
        </div>
        <table class="data-table mt-2">
          <thead>
            <tr>
              <th>Month</th>
              <th>Segment</th>
              <th>Subject</th>
              <th>Status</th>
              <th>Sent</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {data.drafts.map((draft) => (
              <tr>
                <td class="tabular-nums font-medium">{draft.month}</td>
                <td class="text-ink-2">{draft.segment}</td>
                <td class="max-w-[24rem] truncate text-ink-2">{draft.subject}</td>
                <td>
                  {draft.status === "sent"
                    ? <span class="badge bg-gold-soft text-gold">Sent</span>
                    : <span class="badge bg-accent-soft text-accent-2">Draft</span>}
                </td>
                <td class="tabular-nums text-ink-2">
                  {draft.sentAt
                    ? `${new Date(draft.sentAt).toLocaleDateString()} · ${
                      draft.recipientCount ?? 0
                    } recipients`
                    : "—"}
                </td>
                <td class="text-right">
                  <div class="flex justify-end gap-1.5">
                    <a
                      href={`/admin/newsletters/${encodeURIComponent(draft.id)}`}
                      class="btn btn-ghost btn-sm"
                    >
                      Open
                    </a>
                    <form method="post">
                      <input type="hidden" name="action" value="delete" />
                      <input type="hidden" name="id" value={draft.id} />
                      <button
                        type="submit"
                        aria-label="Delete newsletter"
                        title="Delete newsletter"
                        class="inline-flex size-8 items-center justify-center rounded-md text-ink-3 transition hover:bg-danger-soft hover:text-danger"
                      >
                        <svg
                          aria-hidden="true"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          stroke-width="1.7"
                          stroke-linecap="round"
                          stroke-linejoin="round"
                          class="size-[55%]"
                        >
                          <path d="M4 7h16M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2m-9 0 1 13a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-13" />
                        </svg>
                      </button>
                    </form>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!data.drafts.length && (
          <p class="px-4 py-8 text-center text-sm text-ink-3">
            No drafts yet. Generate one for a coming month above.
          </p>
        )}
      </section>

      <div class="mt-8 grid gap-3 lg:grid-cols-[1fr_minmax(16rem,0.5fr)]">
        <section class="card overflow-x-auto">
          <h2 class="px-4 pt-4 text-lg font-semibold">Subscribers</h2>
          <table class="data-table mt-2">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Segment</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {data.subscribers.map((subscriber) => (
                <tr>
                  <td class="font-medium">{subscriber.name}</td>
                  <td class="text-ink-2">{subscriber.email}</td>
                  <td class="text-ink-2">{subscriber.segment}</td>
                  <td class="text-right">
                    <form method="post">
                      <input type="hidden" name="action" value="unsubscribe" />
                      <input type="hidden" name="token" value={subscriber.token} />
                      <button
                        type="submit"
                        aria-label={`Remove ${subscriber.name} from the newsletter`}
                        title={`Remove ${subscriber.name} from the newsletter`}
                        class="inline-flex size-8 items-center justify-center rounded-md text-ink-3 transition hover:bg-danger-soft hover:text-danger"
                      >
                        <svg
                          aria-hidden="true"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          stroke-width="1.7"
                          stroke-linecap="round"
                          stroke-linejoin="round"
                          class="size-[55%]"
                        >
                          <path d="M4 7h16M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2m-9 0 1 13a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-13" />
                        </svg>
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!data.subscribers.length && (
            <p class="px-4 py-8 text-center text-sm text-ink-3">
              Nobody has subscribed yet. Viewers sign up under "Monthly email" in their account
              menu.
            </p>
          )}
        </section>

        <div class="grid content-start gap-3">
          <section class="card p-5">
            <h2 class="text-lg font-semibold">Segments</h2>
            <p class="mt-1 text-xs text-ink-3">
              One newsletter is drafted per distinct group combination.
            </p>
            <ul class="mt-3 grid gap-1.5 text-sm">
              {data.segments.map((segment) => (
                <li class="flex items-center justify-between gap-3">
                  <span class="font-medium">{segment.key}</span>
                  <span class="tabular-nums text-ink-2">{segment.subscriberCount}</span>
                </li>
              ))}
              {!data.segments.length && <li class="text-ink-3">No segments yet.</li>}
            </ul>
          </section>
        </div>
      </div>
    </AdminShell>
  </>
));
