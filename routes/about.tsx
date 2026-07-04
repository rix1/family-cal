import { AppHeader } from "@/components/AppHeader.tsx";
import { getStore } from "@/lib/db.ts";
import { sessionViewer } from "@/lib/viewer_auth.ts";
import { define } from "@/utils.ts";
import type { ComponentChildren } from "preact";
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

function ProfileLink({ signedIn }: { signedIn: boolean }) {
  if (signedIn) {
    return (
      <a href="/profile/" class="font-medium text-accent-2 underline underline-offset-2">
        your profile
      </a>
    );
  }
  return <span class="font-medium text-ink">your profile</span>;
}

function Faq({ question, children }: { question: string; children: ComponentChildren }) {
  return (
    <details class="group border-t border-line py-4 first:border-t-0 first:pt-0">
      <summary class="flex cursor-pointer items-center justify-between gap-3 font-medium [&::-webkit-details-marker]:hidden">
        <span>{question}</span>
        <svg
          class="size-4 shrink-0 text-ink-3 transition-transform group-open:rotate-180"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          stroke-width="1.6"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d="M4 6l4 4 4-4" />
        </svg>
      </summary>
      <div class="mt-2 leading-relaxed text-ink-2">{children}</div>
    </details>
  );
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
          <h2 class="text-lg font-semibold">How it works</h2>
          <p class="mt-3 leading-relaxed text-ink-2">
            There's no company behind this and nothing to install — it's a small, private calendar
            Halvor put together for the family. One person keeps everyone's birthdays and dates in
            one place; you get in through the personal link you were sent, and from there you choose
            how closely you want to follow along.
          </p>

          <h3 class="mt-6 text-sm font-semibold uppercase tracking-wide text-ink-3">
            Three ways to keep up
          </h3>
          <ul class="mt-3 space-y-3 leading-relaxed text-ink-2">
            <li class="flex gap-3">
              <span
                class="grid size-7 shrink-0 place-items-center rounded-md bg-accent-soft text-sm font-semibold text-accent-2"
                aria-hidden="true"
              >
                1
              </span>
              <p>
                <span class="font-medium text-ink">In your browser.</span>{" "}
                Open the calendar to see the month's birthdays, remembrances, and holidays, with
                search and filters. Tap anyone to read their details.
              </p>
            </li>
            <li class="flex gap-3">
              <span
                class="grid size-7 shrink-0 place-items-center rounded-md bg-accent-soft text-sm font-semibold text-accent-2"
                aria-hidden="true"
              >
                2
              </span>
              <p>
                <span class="font-medium text-ink">A little email each month.</span>{" "}
                Switch on a short note that arrives once a month with the coming birthdays — no more
                forgetting. Turn it on from <ProfileLink signedIn={signedIn} />.
              </p>
            </li>
            <li class="flex gap-3">
              <span
                class="grid size-7 shrink-0 place-items-center rounded-md bg-accent-soft text-sm font-semibold text-accent-2"
                aria-hidden="true"
              >
                3
              </span>
              <p>
                <span class="font-medium text-ink">Inside your own calendar.</span>{" "}
                Add the family's dates to the calendar already on your phone or computer (Google,
                Apple, or Outlook). Set it up once and new birthdays simply show up. The link to do
                that lives on <ProfileLink signedIn={signedIn} />.
              </p>
            </li>
          </ul>
        </section>

        <section class="mt-10 px-1">
          <h2 class="text-lg font-semibold">Questions</h2>
          <div class="mt-2">
            <Faq question="Do I need to download an app?">
              No — it's a website. Open your link in any browser and you're in. You can add it to
              your home screen so it feels like an app, but there's nothing to install and no
              account to create.
            </Faq>
            <Faq question="How do I get in the first time?">
              Someone already in the family sends you a personal link. Open it once and that device
              stays signed in — you won't have to log in again on it.
            </Faq>
            <Faq question="Can I use it on more than one device?">
              Yes. Each phone or computer signs in on its own. To add a new one, open the home page,
              choose{" "}
              <span class="font-medium text-ink">Log in</span>, and enter your email — we'll send a
              one-time link to sign that device in. Signing in somewhere new ends the previous
              session, so if you switch back later you may just need a fresh link.
            </Faq>
            <Faq question="What are groups?">
              Groups are the branches of the family — for example each side of it. Every person
              belongs to one, and you choose which groups to follow from{" "}
              <ProfileLink signedIn={signedIn} />. Your calendar, monthly email, and calendar-app
              feed all show the people in the groups you follow, and nothing else.
            </Faq>
            <Faq question="How do I get this into Google or Apple Calendar?">
              On <ProfileLink signedIn={signedIn} />{" "}
              you'll find an "Add to Google Calendar" button and one for Apple Calendar or Outlook.
              Set it up once and the family's dates appear alongside your own — new birthdays and
              changes show up on their own, no updating needed.
            </Faq>
            <Faq question="What is the monthly email?">
              A short note, once a month, with the coming birthdays for the groups you follow —
              written in Norwegian. Switch it on or off anytime from{" "}
              <ProfileLink signedIn={signedIn} />, or with the unsubscribe link in the email itself.
            </Faq>
            <Faq question="Can I add or change people?">
              Only some links can make changes. If yours can, you can add people and their dates,
              record events like weddings and baptisms, sort the family into groups, and link
              relatives by typing <span class="font-medium text-ink">@</span>{" "}
              in a note. If yours can't and something looks wrong or missing, just ask whoever set
              things up.
            </Faq>
            <Faq question="Who can see the calendar?">
              Only people with a link. Your link is your key, so keep it to yourself — anyone who
              has it can see the family calendar. If it ever slips out, ask a family editor for a
              fresh one; the old link stops working right away.
            </Faq>
            <Faq question="Is my data safe?">
              Yes. Everything is stored securely and can't be reached without a personal link —
              nothing is public, sold, or shared, and there are no ads or trackers. The only things
              kept are what an editor adds (names, dates, and short notes) and the email you use to
              sign in.
            </Faq>
          </div>
        </section>
      </main>
    </>
  );
});
