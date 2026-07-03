import { AdminShell } from "@/components/AdminShell.tsx";
import { ConfirmPopover } from "@/components/ConfirmPopover.tsx";
import { CopyButton } from "@/islands/CopyButton.tsx";
import { NewsletterPreview } from "@/islands/NewsletterPreview.tsx";
import { PendingSubmit } from "@/islands/PendingSubmit.tsx";
import { RegenerateProgress } from "@/islands/RegenerateProgress.tsx";
import { Toast } from "@/islands/Toast.tsx";
import { adminDenied, adminViewer } from "@/lib/admin_auth.ts";
import { getStore } from "@/lib/db.ts";
import { getEmailSender } from "@/lib/email.ts";
import { getIntroWriter } from "@/lib/intro_writer.ts";
import {
  deleteDraft,
  draftRecipients,
  newsletterProfileUrl,
  regenerateDraft,
  renderNewsletterEmail,
  sendDraft,
  sendTestDraft,
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
      emailHtml: renderNewsletterEmail(draft, newsletterProfileUrl()),
      saved: ctx.url.searchParams.get("saved") === "1",
      regenerated: ctx.url.searchParams.get("regenerated") === "1",
      sent: ctx.url.searchParams.get("sent") === "1",
      tested: ctx.url.searchParams.get("tested"),
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
        headers: { location: `/admin/newsletters/${encodeURIComponent(id)}?${flag}=1` },
      });
    try {
      // Render the email for as-yet-unsaved form values, so the preview island
      // can refresh live while the admin types. Read-only: nothing is stored.
      if (action === "preview") {
        const draft = await store.getNewsletterDraft(id);
        if (!draft) throw new HttpError(404, "Newsletter draft was not found.");
        const title = String(form.get("title") ?? "").trim();
        const html = renderNewsletterEmail({
          ...draft,
          subject: String(form.get("subject") ?? draft.subject),
          title: title || undefined,
          body: String(form.get("body") ?? draft.body),
        }, newsletterProfileUrl());
        return new Response(html, {
          headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
        });
      }
      if (action === "save") {
        await updateDraftContent(store, id, {
          subject: String(form.get("subject") ?? ""),
          title: String(form.get("title") ?? ""),
          body: String(form.get("body") ?? ""),
        }, viewer.name);
        return back("saved");
      }
      if (action === "regenerate") {
        // Progressive enhancement: the RegenerateProgress island posts `stream=1`
        // and reads per-step NDJSON; a plain form POST gets the usual redirect.
        if (String(form.get("stream") ?? "") === "1") {
          const body = new ReadableStream<Uint8Array>({
            async start(controller) {
              const enc = new TextEncoder();
              const send = (event: unknown) =>
                controller.enqueue(enc.encode(`${JSON.stringify(event)}\n`));
              try {
                await regenerateDraft(
                  store,
                  id,
                  viewer.name,
                  getIntroWriter(),
                  (step) => send({ step }),
                  (event) =>
                    send(
                      event.type === "request"
                        ? { request: { endpoint: event.endpoint, body: event.body } }
                        : { token: event.text },
                    ),
                );
                send({ done: true });
              } catch (error) {
                send({ error: error instanceof Error ? error.message : String(error) });
              } finally {
                controller.close();
              }
            },
          });
          return new Response(body, {
            headers: { "content-type": "application/x-ndjson", "cache-control": "no-cache" },
          });
        }
        await regenerateDraft(store, id, viewer.name, getIntroWriter());
        return back("regenerated");
      }
      if (action === "send") {
        await sendDraft(store, id, viewer.name, getEmailSender());
        return back("sent");
      }
      if (action === "send-test") {
        const email = await sendTestDraft(
          store,
          id,
          String(form.get("email") ?? ""),
          viewer.name,
          getEmailSender(),
        );
        return new Response(null, {
          status: 303,
          headers: {
            location: `/admin/newsletters/${encodeURIComponent(id)}?tested=${
              encodeURIComponent(email)
            }`,
          },
        });
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
            <ConfirmPopover
              id={`confirm-del-${draft.id}`}
              triggerClass="btn btn-ghost"
              trigger="Delete"
              confirmLabel={isSent ? "Delete record" : "Delete draft"}
              message={
                <>
                  Remove this {isSent ? "sent newsletter record" : "draft"} permanently.
                  {!isSent &&
                    " Generating this month again recreates it while the segment still has subscribers and birthdays."}
                </>
              }
            >
              <input type="hidden" name="action" value="delete" />
            </ConfirmPopover>
            {!isSent && (
              <>
                <details data-popover class="relative">
                  <summary class="btn btn-ghost cursor-pointer list-none [&::-webkit-details-marker]:hidden">
                    Generate
                  </summary>
                  <form
                    method="post"
                    class="card absolute right-0 z-30 mt-2 grid w-[min(18rem,calc(100vw-2rem))] gap-3 p-4 shadow-pop"
                  >
                    <input type="hidden" name="action" value="regenerate" />
                    <p class="text-sm text-ink-2">
                      Rewrite the intro and title with the local model and rebuild the list from
                      current data. Your manual edits are discarded.
                    </p>
                    <RegenerateProgress class="btn btn-danger" label="Generate draft" />
                  </form>
                </details>
                <details data-popover class="relative">
                  <summary class="btn btn-ghost cursor-pointer list-none [&::-webkit-details-marker]:hidden">
                    Send test
                  </summary>
                  <form
                    method="post"
                    class="card absolute right-0 z-30 mt-2 grid w-[min(20rem,calc(100vw-2rem))] gap-3 p-4 shadow-pop"
                  >
                    <input type="hidden" name="action" value="send-test" />
                    <p class="text-sm text-ink-2">
                      Sends the draft's current subject and body to one address so you can preview
                      it. Doesn't touch the recipient list or mark the draft sent.
                    </p>
                    <label class="grid gap-1.5 text-sm font-medium">
                      Deliver to
                      <input
                        type="email"
                        name="email"
                        required
                        value="admin@example.com"
                        class="input"
                      />
                    </label>
                    <PendingSubmit
                      class="btn btn-primary"
                      label="Send test"
                      pendingLabel="Sending…"
                      pendingHint="Emailing the test via Resend."
                    />
                  </form>
                </details>
                <details data-popover class="relative">
                  <summary class="btn btn-primary cursor-pointer list-none [&::-webkit-details-marker]:hidden">
                    Send
                  </summary>
                  <form
                    method="post"
                    class="card absolute right-0 z-30 mt-2 grid w-[min(18rem,calc(100vw-2rem))] gap-3 p-4 shadow-pop"
                  >
                    <input type="hidden" name="action" value="send" />
                    <p class="text-sm text-ink-2">
                      Emails this to the {data.recipients.length}{" "}
                      current recipients via Resend, then freezes the draft. This can't be undone.
                    </p>
                    <PendingSubmit
                      class="btn btn-primary"
                      label={`Send to ${data.recipients.length}`}
                      pendingLabel="Sending…"
                      pendingHint="Emailing each recipient via Resend."
                    />
                  </form>
                </details>
              </>
            )}
          </div>
        </div>

        {data.saved && <Toast message="Draft saved." />}
        {data.regenerated && <Toast message="Draft regenerated from current birthday data." />}
        {data.sent && <Toast message="Marked as sent. The draft is now an immutable record." />}
        {data.tested && <Toast message={`Test email sent to ${data.tested}.`} />}

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
                  {draft.title && (
                    <div>
                      <p class="text-sm font-medium">Email title</p>
                      <p class="mt-1 text-sm text-ink-2">{draft.title}</p>
                    </div>
                  )}
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
                    Email title
                    <input name="title" class="input" value={draft.title ?? ""} />
                    <span class="text-xs font-normal text-ink-3">
                      The big heading inside the email. Suggested by the local model when the draft
                      is generated; leave empty for the plain "Bursdager i …" default.
                    </span>
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
                      save. The preview follows your edits as you type.
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
              <NewsletterPreview html={data.emailHtml} />
            </section>

            {!isSent && (
              <section class="card p-5">
                <p class="kicker">Recipients (live)</p>
                <p class="mt-2 text-xs text-ink-3">
                  Derived from current subscriptions until the draft is marked sent. Each recipient
                  gets their own email via Resend, so addresses stay private.
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
