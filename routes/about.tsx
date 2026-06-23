import { AppHeader } from "@/components/AppHeader.tsx";
import { getStore } from "@/lib/db.ts";
import { sessionViewer } from "@/lib/viewer_auth.ts";
import { define } from "@/utils.ts";
import { page } from "fresh";

export const handlers = define.handlers({
  async GET(ctx) {
    const viewer = await sessionViewer(ctx.req, await getStore());
    return page({
      viewerName: viewer?.name,
      adminUrl: viewer?.canEdit ? "/admin/" : undefined,
    });
  },
});

function SubscribeLink({ signedIn }: { signedIn: boolean }) {
  if (signedIn) {
    return (
      <a href="/newsletter/" class="font-medium text-accent-2 underline underline-offset-2">
        the Subscribe page
      </a>
    );
  }
  return <span class="font-medium text-ink">the Subscribe page</span>;
}

export default define.page<typeof handlers>(function About({ data }) {
  const signedIn = Boolean(data.viewerName);
  return (
    <>
      <title>About Family Calendar</title>

      <AppHeader
        title="About"
        viewerName={data.viewerName}
        current="about"
        adminUrl={data.adminUrl}
        logoutUrl={data.viewerName ? "/logout" : undefined}
      />

      <main class="mx-auto max-w-2xl px-4 py-10 pb-20">
        <h1 class="text-3xl font-semibold tracking-tight">Family Calendar</h1>
        <p class="mt-3 leading-relaxed text-ink-2">
          A quiet, private place for the dates that matter to our family — birthdays, the
          anniversaries of those we've lost, and the holidays we share. No ads, nothing public, and
          nobody to friend or follow.
        </p>

        <section class="card mt-8 p-6">
          <h2 class="text-lg font-semibold">Getting in</h2>
          <p class="mt-3 leading-relaxed text-ink-2">
            Access is by a personal invite link from someone already in the family. That link is
            your key — once you've opened it, this device stays signed in. On a new phone or
            computer, open the home page, choose{" "}
            <span class="font-medium text-ink">Log in</span>, and enter your email; we'll send a
            one-time link to sign you in.
          </p>
        </section>

        <section class="card mt-4 p-6">
          <h2 class="text-lg font-semibold">Three ways to keep up</h2>
          <ul class="mt-3 space-y-4 leading-relaxed text-ink-2">
            <li>
              <span class="font-medium text-ink">In your browser.</span>{" "}
              Open the calendar to see the month's birthdays, remembrances, and holidays, with
              search and group filters. Tap anyone to read their details.
            </li>
            <li>
              <span class="font-medium text-ink">By monthly email.</span>{" "}
              Opt in to a short note once a month listing the coming birthdays. Set it up on{" "}
              <SubscribeLink signedIn={signedIn} />.
            </li>
            <li>
              <span class="font-medium text-ink">In your own calendar app.</span>{" "}
              Subscribe once and the family's dates appear alongside your own in Google Calendar,
              Apple Calendar, or Outlook — updating on their own as people are added. You'll find
              your personal subscribe link on <SubscribeLink signedIn={signedIn} />.
            </li>
          </ul>
        </section>

        <section class="card mt-4 p-6">
          <h2 class="text-lg font-semibold">If your link can edit</h2>
          <p class="mt-3 leading-relaxed text-ink-2">
            Some links can make changes. Editors add people and their dates, sort the family into
            groups, jot small notes (typing <span class="font-medium text-ink">@</span>{" "}
            links one person to another), and decide who has access.
          </p>
        </section>

        <section class="card mt-4 p-6">
          <h2 class="text-lg font-semibold">A note on privacy</h2>
          <p class="mt-3 leading-relaxed text-ink-2">
            Your link is your key: anyone who has it can see the family calendar. Keep it to
            yourself, and if it ever slips out, ask a family editor for a fresh one — the old link
            stops working the moment a new one is issued.
          </p>
        </section>
      </main>
    </>
  );
});
