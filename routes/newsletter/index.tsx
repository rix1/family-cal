import { AppHeader } from "@/components/AppHeader.tsx";
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
    return page({
      viewerName: viewer.name,
      adminUrl: viewer.canEdit ? "/admin/" : undefined,
      newsletter: viewer.newsletter ?? null,
      profileEmail: viewer.email ?? null,
      groups: await store.listGroups(),
      saved: ctx.url.searchParams.get("saved") === "1",
      unsubscribed: ctx.url.searchParams.get("unsubscribed") === "1",
    });
  },
  async POST(ctx) {
    const store = await getStore();
    const viewer = await sessionViewer(ctx.req, store);
    if (!viewer) throw new HttpError(404, "This page requires a family access link.");
    const form = await ctx.req.formData();
    try {
      if (form.get("action") === "unsubscribe") {
        await clearNewsletterPreference(store, viewer);
        return new Response(null, {
          status: 303,
          headers: { location: "/newsletter/?unsubscribed=1" },
        });
      }
      await setNewsletterPreference(store, viewer, {
        email: form.get("email"),
        groups: form.getAll("groups").map(String),
      });
    } catch (error) {
      if (error instanceof ValidationError) throw new HttpError(400, error.message);
      throw error;
    }
    return new Response(null, { status: 303, headers: { location: "/newsletter/?saved=1" } });
  },
});

export default define.page<typeof handlers>(({ data }) => (
  <>
    <title>Monthly email | Family Calendar</title>
    <div class="min-h-screen">
      <AppHeader
        title="Monthly email"
        viewerName={data.viewerName}
        current="newsletter"
        adminUrl={data.adminUrl}
        logoutUrl="/logout"
      />
      <main class="mx-auto max-w-2xl px-4 pb-20 pt-8">
        <h1 class="text-2xl font-semibold tracking-tight">Monthly birthday email</h1>
        <p class="mt-2 leading-relaxed text-ink-2">
          Once a month,{" "}
          {data.viewerName.split(" ")[0]}, you can get next month's family birthdays by email —
          written in Norwegian and sent by a family admin. No spam, and you can unsubscribe any
          time.
        </p>

        {data.saved && (
          <p class="mt-6 rounded-xl border border-accent/40 bg-accent-soft px-4 py-3 text-sm font-medium text-accent-2">
            Your newsletter preferences are saved.
          </p>
        )}
        {data.unsubscribed && (
          <p class="mt-6 rounded-xl border border-accent/40 bg-accent-soft px-4 py-3 text-sm font-medium text-accent-2">
            You are unsubscribed. You can sign up again whenever you like.
          </p>
        )}

        <form method="post" class="card mt-8 grid gap-6 p-6">
          <label class="grid gap-2 text-sm font-medium">
            Email address
            <input
              type="email"
              name="email"
              required
              autocomplete="email"
              class="input"
              placeholder="you@example.com"
              value={data.newsletter?.email ?? data.profileEmail ?? ""}
            />
          </label>

          <fieldset>
            <legend class="text-sm font-medium">Newsletter groups</legend>
            <p class="mt-1 text-xs text-ink-3">
              Independent of your calendar groups. No selection means birthdays from all groups.
            </p>
            <div class="mt-3 grid gap-2 sm:grid-cols-2">
              {data.groups.map((group) => (
                <label class="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    name="groups"
                    value={group.key}
                    class="accent-accent"
                    checked={data.newsletter?.groups.includes(group.key) ?? false}
                  />
                  <span>{group.label}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <button type="submit" class="btn btn-primary">
            {data.newsletter ? "Save preferences" : "Subscribe"}
          </button>
        </form>

        {data.newsletter && (
          <form method="post" class="mt-4 flex items-center justify-between gap-3 px-1">
            <p class="text-sm text-ink-3">
              Subscribed since {new Date(data.newsletter.subscribedAt).toLocaleDateString()}.
            </p>
            <input type="hidden" name="action" value="unsubscribe" />
            <button type="submit" class="btn btn-danger btn-sm">
              Unsubscribe
            </button>
          </form>
        )}
      </main>
    </div>
  </>
));
