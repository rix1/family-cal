import { AppHeader } from "@/components/AppHeader.tsx";
import { CopyButton } from "@/islands/CopyButton.tsx";
import { ensureFeedToken, setViewerGroups } from "@/lib/access_links.ts";
import { getStore } from "@/lib/db.ts";
import { clearNewsletterPreference, setNewsletterPreference } from "@/lib/newsletter.ts";
import { ValidationError } from "@/lib/people.ts";
import { sessionViewer } from "@/lib/viewer_auth.ts";
import { define } from "@/utils.ts";
import { HttpError, page } from "fresh";

export const handlers = define.handlers({
  async GET(ctx) {
    const store = await getStore();
    const viewer = await sessionViewer(ctx.req, store);
    if (!viewer) throw new HttpError(404, "This page requires a family access link.");
    const baseUrl = Deno.env.get("BASE_URL") ?? ctx.url.origin;
    const feedUrl = `${baseUrl}/cal/${await ensureFeedToken(store, viewer)}.ics`;
    return page({
      viewerName: viewer.name,
      email: viewer.email ?? null,
      adminUrl: viewer.canEdit ? "/admin/" : undefined,
      groups: await store.listGroups(),
      followedGroups: viewer.groups,
      subscribed: Boolean(viewer.newsletter),
      feedUrl,
      saved: ctx.url.searchParams.get("saved"),
    });
  },
  async POST(ctx) {
    const store = await getStore();
    const viewer = await sessionViewer(ctx.req, store);
    if (!viewer) throw new HttpError(404, "This page requires a family access link.");
    const form = await ctx.req.formData();
    const action = form.get("action");
    try {
      if (action === "groups") {
        await setViewerGroups(store, viewer, form.getAll("groups").map(String));
        return redirect("groups");
      }
      if (action === "unsubscribe") {
        await clearNewsletterPreference(store, viewer);
        return redirect("unsubscribed");
      }
      if (action === "subscribe") {
        await setNewsletterPreference(store, viewer);
        return redirect("subscribed");
      }
    } catch (error) {
      if (error instanceof ValidationError) throw new HttpError(400, error.message);
      throw error;
    }
    throw new HttpError(400, "Unknown action.");
  },
});

function redirect(saved: string): Response {
  return new Response(null, { status: 303, headers: { location: `/profile/?saved=${saved}` } });
}

const FLASH: Record<string, string> = {
  groups: "Your groups are saved.",
  subscribed: "You're subscribed to the monthly email.",
  unsubscribed: "You're unsubscribed from the monthly email.",
};

export default define.page<typeof handlers>(({ data }) => {
  const webcalUrl = data.feedUrl.replace(/^https?:/, "webcal:");
  const googleUrl = `https://calendar.google.com/calendar/r?cid=${
    encodeURIComponent(data.feedUrl)
  }`;
  const flash = data.saved ? FLASH[data.saved] : "";
  return (
    <>
      <title>Profile | Family Calendar</title>
      <div class="min-h-screen">
        <AppHeader
          title="Profile"
          viewerName={data.viewerName}
          current="profile"
          adminUrl={data.adminUrl}
          logoutUrl="/logout"
        />
        <main class="mx-auto max-w-2xl px-4 pb-20 pt-8">
          <h1 class="text-2xl font-semibold tracking-tight">Profile</h1>
          <p class="mt-2 leading-relaxed text-ink-2">
            Your account, the groups you follow, and how you keep up with the family's dates.
          </p>

          {flash && (
            <p class="mt-6 rounded-xl border border-accent/40 bg-accent-soft px-4 py-3 text-sm font-medium text-accent-2">
              {flash}
            </p>
          )}

          {/* Profile + group affiliation */}
          <section class="card mt-8 grid gap-6 p-6">
            <div>
              <h2 class="font-semibold">You</h2>
              <dl class="mt-3 grid gap-3 sm:grid-cols-2">
                <div>
                  <dt class="text-xs font-medium uppercase tracking-wide text-ink-3">Name</dt>
                  <dd class="mt-0.5 text-sm">{data.viewerName}</dd>
                </div>
                <div>
                  <dt class="text-xs font-medium uppercase tracking-wide text-ink-3">Email</dt>
                  <dd class="mt-0.5 text-sm">{data.email ?? "—"}</dd>
                </div>
              </dl>
              <p class="mt-2 text-xs text-ink-3">
                Ask a family editor if your name or email needs to change.
              </p>
            </div>

            <form method="post" class="grid gap-3 border-t border-line pt-5">
              <input type="hidden" name="action" value="groups" />
              <div>
                <h3 class="text-sm font-medium">Groups you follow</h3>
                <p class="mt-1 text-xs text-ink-3">
                  Drives your calendar, your monthly email, and your calendar feed. No selection
                  means you won't see anyone.
                </p>
              </div>
              <div class="grid gap-2 sm:grid-cols-2">
                {data.groups.map((group) => (
                  <label class="flex cursor-pointer items-start gap-3 rounded-lg border border-line-2 px-3 py-2.5 text-sm font-medium hover:bg-inset has-checked:border-accent has-checked:bg-accent-soft has-checked:text-accent-2">
                    <input
                      type="checkbox"
                      name="groups"
                      value={group.key}
                      checked={data.followedGroups.includes(group.key)}
                      class="mt-0.5 accent-accent"
                    />
                    <span class="min-w-0">
                      <span class="block">{group.label}</span>
                      {group.description && (
                        <span class="mt-0.5 block text-xs font-normal leading-relaxed text-ink-3">
                          {group.description}
                        </span>
                      )}
                    </span>
                  </label>
                ))}
              </div>
              <button type="submit" class="btn btn-primary justify-self-start">
                Save groups
              </button>
            </form>
          </section>

          {/* Monthly email */}
          <section class="card mt-4 flex items-center justify-between gap-4 p-6">
            <div class="min-w-0">
              <h2 class="font-semibold">Monthly email</h2>
              <p class="mt-1 text-sm leading-relaxed text-ink-2">
                A short note once a month with the coming birthdays for the groups you follow,
                written in Norwegian. {data.email ? `Sent to ${data.email}.` : ""}
              </p>
            </div>
            {data.email
              ? (
                <form method="post" class="shrink-0">
                  <input
                    type="hidden"
                    name="action"
                    value={data.subscribed ? "unsubscribe" : "subscribe"}
                  />
                  <button
                    type="submit"
                    role="switch"
                    aria-checked={data.subscribed}
                    aria-label="Monthly email subscription"
                    class={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      data.subscribed ? "bg-accent" : "bg-line-2"
                    }`}
                  >
                    <span
                      class={`inline-block size-5 rounded-full bg-surface shadow transition-transform ${
                        data.subscribed ? "translate-x-[1.375rem]" : "translate-x-0.5"
                      }`}
                    />
                  </button>
                </form>
              )
              : <span class="shrink-0 text-xs text-ink-3">Needs an email</span>}
          </section>

          {/* Calendar subscription */}
          <section class="card mt-4 grid gap-5 p-6">
            <div>
              <h2 class="font-semibold">Subscribe in your calendar app</h2>
              <p class="mt-1 text-sm leading-relaxed text-ink-2">
                Add the family's birthdays, remembrances, and holidays to Google Calendar, Apple
                Calendar, or Outlook. The feed follows the groups you choose above and updates on
                its own.
              </p>
            </div>

            <div class="flex items-center gap-2">
              <input
                readonly
                value={data.feedUrl}
                aria-label="Your calendar feed URL"
                class="input font-mono text-xs"
              />
              <CopyButton value={data.feedUrl} label="Copy" />
            </div>

            <div class="flex flex-wrap gap-2">
              <a
                class="btn btn-primary btn-sm"
                href={googleUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                Add to Google Calendar
              </a>
              <a class="btn btn-ghost btn-sm" href={webcalUrl}>
                Apple Calendar or Outlook
              </a>
            </div>

            <p class="text-xs text-ink-3">
              This feed link is private to you. Anyone who has it can see the family calendar, so
              keep it to yourself.
            </p>
          </section>
        </main>
      </div>
    </>
  );
});
