import { render } from "@deno/gfm";
import { AdminShell } from "@/components/AdminShell.tsx";
import { CopyButton } from "@/islands/CopyButton.tsx";
import { NewsletterPreview } from "@/islands/NewsletterPreview.tsx";
import { adminDenied, adminViewer } from "@/lib/admin_auth.ts";
import { getStore } from "@/lib/db.ts";
import {
  deleteDraft,
  draftRecipients,
  markDraftSent,
  regenerateDraft,
  updateDraftContent,
} from "@/lib/newsletter.ts";
import { ValidationError } from "@/lib/people.ts";
import { define } from "@/utils.ts";
import { HttpError, page } from "fresh";

/**
 * New draft ids are opaque UUIDs, but early drafts used `month_segment` ids
 * whose `+` arrives percent-encoded (route params are not decoded). Decode so
 * those legacy records stay reachable (and deletable).
 */
function draftIdParam(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

export const handlers = define.handlers({
  async GET(ctx) {
    const store = await getStore();
    const viewer = await adminViewer(ctx.req, store);
    if (!viewer) return adminDenied();
    const draft = await store.getNewsletterDraft(draftIdParam(ctx.params.id));
    if (!draft) throw new HttpError(404, "Newsletter draft was not found.");
    const recipients = draftRecipients(await store.listViewers(), draft);
    return page({
      viewer,
      draft,
      recipients: recipients.map((recipient) => ({
        name: recipient.name,
        email: recipient.newsletter!.email,
      })),
      bcc: recipients.map((recipient) => recipient.newsletter!.email).join(", "),
      html: render(draft.body),
      saved: ctx.url.searchParams.get("saved") === "1",
      regenerated: ctx.url.searchParams.get("regenerated") === "1",
      sent: ctx.url.searchParams.get("sent") === "1",
    });
  },
  async POST(ctx) {
    const store = await getStore();
    const viewer = await adminViewer(ctx.req, store);
    if (!viewer) return adminDenied();
    const id = draftIdParam(ctx.params.id);
    const form = await ctx.req.formData();
    const action = String(form.get("action") ?? "");
    const back = (flag: string) =>
      new Response(null, {
        status: 303,
        headers: { location: `/admin/newsletters/${encodeURIComponent(id)}/?${flag}=1` },
      });
    try {
      if (action === "save") {
        await updateDraftContent(store, id, {
          subject: String(form.get("subject") ?? ""),
          body: String(form.get("body") ?? ""),
        }, viewer.name);
        return back("saved");
      }
      if (action === "regenerate") {
        await regenerateDraft(store, id, viewer.name);
        return back("regenerated");
      }
      if (action === "send") {
        await markDraftSent(store, id, viewer.name);
        return back("sent");
      }
      if (action === "delete") {
        await deleteDraft(store, id, viewer.name);
        return new Response(null, {
          status: 303,
          headers: { location: "/admin/newsletters/?deleted=1" },
        });
      }
    } catch (error) {
      if (error instanceof ValidationError) throw new HttpError(400, error.message);
      throw error;
    }
    throw new HttpError(400, "Unknown newsletter action.");
  },
});

export default define.page<typeof handlers>(({ data }) => {
  const { draft } = data;
  const isSent = draft.status === "sent";
  return (
    <>
      <title>{draft.subject} | Family Calendar Admin</title>
      <AdminShell
        current="newsletters"
        viewerName={data.viewer.name}
        calendarUrl="/calendar/"
      >
        <a href="/admin/newsletters/" class="text-sm font-medium text-ink-2 hover:text-ink">
          ← All newsletters
        </a>
        <div class="mt-3 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 class="text-2xl font-semibold tracking-tight">{draft.month}</h1>
            <p class="mt-1 text-sm text-ink-2">
              Segment <span class="font-medium">{draft.segment}</span>
              {" · "}
              {isSent
                ? <span class="badge bg-gold-soft text-gold">Sent</span>
                : <span class="badge bg-accent-soft text-accent-2">Draft</span>}
            </p>
          </div>
          <div class="flex items-center gap-2">
            <details class="relative">
              <summary class="btn btn-ghost cursor-pointer list-none [&::-webkit-details-marker]:hidden">
                Delete
              </summary>
              <form
                method="post"
                class="card absolute right-0 z-30 mt-2 grid w-[min(18rem,calc(100vw-2rem))] gap-3 p-4 shadow-pop"
              >
                <input type="hidden" name="action" value="delete" />
                <p class="text-sm text-ink-2">
                  Remove this {isSent ? "sent newsletter record" : "draft"} permanently.
                  {!isSent &&
                    " Generating this month again recreates it while the segment still has subscribers and birthdays."}
                </p>
                <button type="submit" class="btn btn-danger">
                  Delete {isSent ? "record" : "draft"}
                </button>
              </form>
            </details>
            {!isSent && (
              <>
                <details class="relative">
                  <summary class="btn btn-ghost cursor-pointer list-none [&::-webkit-details-marker]:hidden">
                    Regenerate
                  </summary>
                  <form
                    method="post"
                    class="card absolute right-0 z-30 mt-2 grid w-[min(18rem,calc(100vw-2rem))] gap-3 p-4 shadow-pop"
                  >
                    <input type="hidden" name="action" value="regenerate" />
                    <p class="text-sm text-ink-2">
                      Rebuild subject, body and prompt from current birthday data. Your manual edits
                      are discarded.
                    </p>
                    <button type="submit" class="btn btn-danger">
                      Regenerate draft
                    </button>
                  </form>
                </details>
                <details class="relative">
                  <summary class="btn btn-primary cursor-pointer list-none [&::-webkit-details-marker]:hidden">
                    Mark as sent
                  </summary>
                  <form
                    method="post"
                    class="card absolute right-0 z-30 mt-2 grid w-[min(18rem,calc(100vw-2rem))] gap-3 p-4 shadow-pop"
                  >
                    <input type="hidden" name="action" value="send" />
                    <p class="text-sm text-ink-2">
                      Only after you emailed it (BCC) to the {data.recipients.length}{" "}
                      current recipients. The draft then becomes immutable.
                    </p>
                    <button type="submit" class="btn btn-primary">
                      Confirm sent
                    </button>
                  </form>
                </details>
              </>
            )}
          </div>
        </div>

        {data.saved && (
          <p class="mt-6 rounded-xl border border-accent/40 bg-accent-soft px-4 py-3 text-sm font-medium text-accent-2">
            Draft saved.
          </p>
        )}
        {data.regenerated && (
          <p class="mt-6 rounded-xl border border-accent/40 bg-accent-soft px-4 py-3 text-sm font-medium text-accent-2">
            Draft regenerated from current birthday data.
          </p>
        )}
        {data.sent && (
          <p class="mt-6 rounded-xl border border-accent/40 bg-accent-soft px-4 py-3 text-sm font-medium text-accent-2">
            Marked as sent. The draft is now an immutable record.
          </p>
        )}

        {isSent && (
          <section class="card mt-6 p-5">
            <p class="kicker">Send record</p>
            <p class="mt-2 text-sm text-ink-2">
              Sent {draft.sentAt ? new Date(draft.sentAt).toLocaleString() : "—"} by{" "}
              {draft.sentBy ?? "—"} to {draft.recipientCount ?? 0} recipients.
            </p>
          </section>
        )}

        <div class="mt-6 grid gap-3 lg:grid-cols-2">
          <section class="card grid content-start gap-4 p-5">
            <div class="flex items-center justify-between gap-3">
              <p class="kicker">Email</p>
              <div class="flex flex-wrap items-center gap-1.5">
                <CopyButton value={draft.subject} label="Copy subject" />
                {!isSent && <CopyButton value={data.bcc} label="Copy BCC" />}
                <CopyButton value={draft.body} label="Copy Markdown" />
              </div>
            </div>
            {isSent
              ? (
                <>
                  <div>
                    <p class="text-sm font-medium">Subject</p>
                    <p class="mt-1 text-sm text-ink-2">{draft.subject}</p>
                  </div>
                  <div>
                    <p class="text-sm font-medium">Markdown</p>
                    <pre class="mt-1 max-h-96 overflow-auto whitespace-pre-wrap rounded-lg bg-inset p-3 font-mono text-xs text-ink-2">{draft.body}</pre>
                  </div>
                </>
              )
              : (
                <form method="post" class="grid gap-4">
                  <input type="hidden" name="action" value="save" />
                  <label class="grid gap-1.5 text-sm font-medium">
                    Subject
                    <input name="subject" required class="input" value={draft.subject} />
                  </label>
                  <label class="grid gap-1.5 text-sm font-medium">
                    Body (Markdown)
                    <textarea
                      name="body"
                      rows={16}
                      class="input min-h-64 font-mono text-xs leading-relaxed"
                    >
                      {draft.body}
                    </textarea>
                    <span class="text-xs font-normal text-ink-3">
                      Paste the generated introduction over the placeholder on the first line, then
                      save. The preview updates after saving.
                    </span>
                  </label>
                  <button type="submit" class="btn btn-primary justify-self-start">
                    Save draft
                  </button>
                </form>
              )}
          </section>

          <div class="grid content-start gap-3">
            <section class="card p-5">
              <NewsletterPreview html={data.html} />
            </section>

            <section class="card p-5">
              <div class="flex items-center justify-between gap-3">
                <p class="kicker">Introduction prompt</p>
                <CopyButton value={draft.prompt} label="Copy prompt" />
              </div>
              <p class="mt-2 text-xs text-ink-3">
                Paste into the LLM of your choice. It contains only anonymous dates and counts — no
                names or other personal data.
              </p>
              <pre class="mt-3 whitespace-pre-wrap rounded-lg bg-inset p-3 font-mono text-xs text-ink-2">{draft.prompt}</pre>
            </section>

            {!isSent && (
              <section class="card p-5">
                <p class="kicker">Recipients (live)</p>
                <p class="mt-2 text-xs text-ink-3">
                  Derived from current subscriptions until the draft is marked sent. Use the BCC
                  field so addresses stay private.
                </p>
                <ul class="mt-3 grid gap-1 text-sm">
                  {data.recipients.map((recipient) => (
                    <li class="flex items-center justify-between gap-3">
                      <span class="font-medium">{recipient.name}</span>
                      <span class="text-ink-2">{recipient.email}</span>
                    </li>
                  ))}
                  {!data.recipients.length && (
                    <li class="text-ink-3">No active subscribers in this segment.</li>
                  )}
                </ul>
              </section>
            )}
          </div>
        </div>
      </AdminShell>
    </>
  );
});
