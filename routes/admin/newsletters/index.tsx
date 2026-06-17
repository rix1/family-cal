import { AdminShell } from "@/components/AdminShell.tsx";
import { NewsletterAutogen } from "@/islands/NewsletterAutogen.tsx";
import { adminDenied, adminViewer } from "@/lib/admin_auth.ts";
import { getStore } from "@/lib/db.ts";
import { json } from "@/lib/http.ts";
import {
  activeSubscribers,
  addMonths,
  ensureDraftsForMonth,
  inLeadWindow,
  monthKey,
  type MonthRef,
  normalizeLeadDays,
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
    const [settings, viewers, drafts] = await Promise.all([
      store.getNewsletterSettings(),
      store.listViewers(),
      store.listNewsletterDrafts(),
    ]);
    const subscribers = activeSubscribers(viewers)
      .sort((a, b) => a.name.localeCompare(b.name));
    const current = currentOsloMonth();
    return page({
      viewer,
      settings,
      subscribers: subscribers.map((subscriber) => ({
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
      autogen: inLeadWindow(new Date(), settings.leadDays),
      monthMin: monthKey(current),
      monthMax: monthKey(addMonths(current, 12)),
      generated: ctx.url.searchParams.get("generated"),
      savedSettings: ctx.url.searchParams.get("settings") === "1",
      deleted: ctx.url.searchParams.get("deleted") === "1",
    });
  },
  async POST(ctx) {
    const store = await getStore();
    const viewer = await adminViewer(ctx.req, store);
    if (!viewer) return adminDenied();
    const form = await ctx.req.formData();
    const action = String(form.get("action") ?? "");

    if (action === "ensure") {
      // Idempotent: invoked by the autogen island during the lead window.
      const settings = await store.getNewsletterSettings();
      if (!inLeadWindow(new Date(), settings.leadDays)) return json({ created: 0 });
      const created = await ensureDraftsForMonth(
        store,
        addMonths(currentOsloMonth(), 1),
        viewer.name,
      );
      return json({ created: created.length });
    }

    if (action === "settings") {
      let leadDays: number;
      try {
        leadDays = normalizeLeadDays(form.get("leadDays"));
      } catch (error) {
        if (error instanceof ValidationError) throw new HttpError(400, error.message);
        throw error;
      }
      await store.setNewsletterSettings({ leadDays });
      await store.appendAudit({
        at: new Date().toISOString(),
        actor: viewer.name,
        action: "newsletter_settings",
        detail: `Lead time set to ${leadDays} days`,
      });
      return new Response(null, {
        status: 303,
        headers: { location: "/admin/newsletters/?settings=1" },
      });
    }

    if (action === "generate") {
      const month = parseMonthKey(String(form.get("month") ?? ""));
      if (!month) throw new HttpError(400, "Pick a month to generate drafts for.");
      const current = currentOsloMonth();
      const offset = monthIndex(month) - monthIndex(current);
      if (offset < 0 || offset > 12) {
        throw new HttpError(400, "Drafts can cover the current month through twelve months ahead.");
      }
      const created = await ensureDraftsForMonth(store, month, viewer.name);
      return new Response(null, {
        status: 303,
        headers: { location: `/admin/newsletters/?generated=${created.length}` },
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
      {data.autogen && <NewsletterAutogen />}
      <div class="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 class="text-2xl font-semibold tracking-tight">Newsletters</h1>
          <p class="mt-1 max-w-2xl text-sm text-ink-2">
            Monthly birthday emails in Norwegian. Drafts are prepared here per audience segment; you
            copy the result into your own email client and send it with BCC.
          </p>
        </div>
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
                One draft per subscriber segment with birthdays. Existing drafts are kept.
              </span>
            </label>
            <button type="submit" class="btn btn-primary">
              Generate
            </button>
          </form>
        </details>
      </div>

      {data.generated !== null && (
        <p class="mt-6 rounded-xl border border-accent/40 bg-accent-soft px-4 py-3 text-sm font-medium text-accent-2">
          {data.generated === "0"
            ? "Nothing new to generate: drafts already exist or no segment has birthdays."
            : `Generated ${data.generated} draft${data.generated === "1" ? "" : "s"}.`}
        </p>
      )}
      {data.savedSettings && (
        <p class="mt-6 rounded-xl border border-accent/40 bg-accent-soft px-4 py-3 text-sm font-medium text-accent-2">
          Newsletter settings saved.
        </p>
      )}
      {data.deleted && (
        <p class="mt-6 rounded-xl border border-accent/40 bg-accent-soft px-4 py-3 text-sm font-medium text-accent-2">
          Newsletter deleted.
        </p>
      )}

      <section class="card mt-8 overflow-x-auto">
        <div class="flex items-baseline justify-between gap-3 px-4 pt-4">
          <h2 class="text-lg font-semibold">Drafts</h2>
          {data.autogen && (
            <p class="text-xs text-ink-3">
              Inside the lead window — next month's drafts are ensured automatically.
            </p>
          )}
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
                  <a
                    href={`/admin/newsletters/${encodeURIComponent(draft.id)}/`}
                    class="btn btn-ghost btn-sm"
                  >
                    Open
                  </a>
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
              </tr>
            </thead>
            <tbody>
              {data.subscribers.map((subscriber) => (
                <tr>
                  <td class="font-medium">{subscriber.name}</td>
                  <td class="text-ink-2">{subscriber.email}</td>
                  <td class="text-ink-2">{subscriber.segment}</td>
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

          <section class="card p-5">
            <h2 class="text-lg font-semibold">Settings</h2>
            <form method="post" class="mt-3 grid gap-3">
              <input type="hidden" name="action" value="settings" />
              <label class="grid gap-1.5 text-sm font-medium">
                Lead time (days)
                <input
                  type="number"
                  name="leadDays"
                  min="1"
                  max="28"
                  step="1"
                  required
                  value={data.settings.leadDays}
                  class="input"
                />
                <span class="text-xs font-normal text-ink-3">
                  During the final days of a month (Europe/Oslo), opening this page prepares next
                  month's drafts automatically.
                </span>
              </label>
              <button type="submit" class="btn btn-primary">
                Save
              </button>
            </form>
          </section>
        </div>
      </div>
    </AdminShell>
  </>
));
