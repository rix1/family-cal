import { groupBadgeClass } from "@/lib/group_colors.ts";
import type { ViewGroup } from "@/lib/view_data.ts";
import type { ComponentChildren } from "preact";
import { useEffect, useMemo, useState } from "preact/hooks";

interface WelcomeTourProps {
  viewerName: string;
  /** Personal iCal feed URL, ready for the Google/Apple buttons. */
  feedUrl: string;
  hasEmail: boolean;
  canEdit: boolean;
  subscribed: boolean;
  groups: Record<string, ViewGroup>;
  followedGroups: string[];
}

interface TourStep {
  kicker: string;
  title: string;
  body: ComponentChildren;
}

/** Tell the server, but don't make the UI wait on it. */
function post(action: "subscribe" | "done"): Promise<Response> {
  return fetch("/api/welcome", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action }),
  });
}

/**
 * One-time, skippable introduction shown right after joining through an
 * invite. Finishing or skipping stamps `welcomedAt` on the viewer, so the
 * tour never reappears — on this or any other device.
 */
export function WelcomeTour({
  viewerName,
  feedUrl,
  hasEmail,
  canEdit,
  subscribed: initialSubscribed,
  groups,
  followedGroups,
}: WelcomeTourProps) {
  const [open, setOpen] = useState(true);
  const [step, setStep] = useState(0);
  const [subscribed, setSubscribed] = useState(initialSubscribed);
  const [subscribing, setSubscribing] = useState(false);
  const [subscribeError, setSubscribeError] = useState("");

  const firstName = viewerName.split(" ")[0] || viewerName;
  const webcalUrl = feedUrl.replace(/^https?:/, "webcal:");
  const googleUrl = `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(feedUrl)}`;

  function finish() {
    setOpen(false);
    // Drop ?welcome=1 so a reload doesn't flash the tour before the server
    // sees the welcomedAt stamp.
    try {
      history.replaceState(null, "", "/calendar/");
    } catch { /* not critical */ }
    post("done").catch(() => {/* worst case: the tour shows once more */});
  }

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") finish();
    }
    globalThis.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      globalThis.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  async function subscribe() {
    setSubscribing(true);
    setSubscribeError("");
    try {
      const res = await post("subscribe");
      if (!res.ok) throw new Error(await res.text());
      setSubscribed(true);
    } catch {
      setSubscribeError("Could not subscribe right now — you can do it later from your profile.");
    } finally {
      setSubscribing(false);
    }
  }

  const steps = useMemo<TourStep[]>(() => {
    const followed = followedGroups
      .map((key) => ({ key, group: groups[key] }))
      .filter((entry) => entry.group);
    const out: TourStep[] = [
      {
        kicker: "Welcome",
        title: `Good to have you, ${firstName}`,
        body: (
          <>
            <p>
              This calendar keeps the family's birthdays, remembrances, weddings, and other
              celebrations in one place — alongside the public holidays.
            </p>
            <p class="mt-3">
              You see the people in the groups you follow{followed.length ? ":" : "."}
            </p>
            {followed.length
              ? (
                <div class="mt-2 flex flex-wrap gap-1.5">
                  {followed.map(({ key, group }) => (
                    <span key={key} class={`badge ${groupBadgeClass(group.color)}`}>
                      {group.label}
                    </span>
                  ))}
                </div>
              )
              : (
                <p class="mt-2 text-sm text-ink-3">
                  You don't follow any groups yet, so the calendar is empty for now.
                </p>
              )}
            <p class="mt-3 text-sm text-ink-3">
              Groups are the branches of the family. Change which ones you follow anytime on{" "}
              <a href="/profile/" class="font-medium text-accent-2 underline underline-offset-2">
                your profile
              </a>.
            </p>
          </>
        ),
      },
      {
        kicker: "Your calendar app",
        title: "Take it with you",
        body: (
          <>
            <p>
              Add the family's dates to the calendar you already use. The feed follows the groups
              you chose and updates on its own — set it up once and forget it.
            </p>
            <div class="mt-4 flex flex-wrap gap-2">
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
            <p class="mt-3 text-sm text-ink-3">
              The link is private to you — it also lives on your profile if you'd rather do this
              later.
            </p>
          </>
        ),
      },
      {
        kicker: "Monthly email",
        title: "A short note, once a month",
        body: (
          <>
            <p>
              At the end of each month you can get a short email (in Norwegian) with the coming
              birthdays for your groups. No noise — one email, once a month.
            </p>
            {subscribed
              ? (
                <p class="mt-4 rounded-lg border border-accent/40 bg-accent-soft px-3.5 py-2.5 text-sm font-medium text-accent-2">
                  You're subscribed. Unsubscribe anytime from your profile or the email itself.
                </p>
              )
              : hasEmail
              ? (
                <div class="mt-4">
                  <button
                    type="button"
                    class="btn btn-primary btn-sm"
                    disabled={subscribing}
                    onClick={subscribe}
                  >
                    {subscribing ? "Subscribing…" : "Subscribe me"}
                  </button>
                  {subscribeError && <p class="mt-2 text-sm text-ink-3">{subscribeError}</p>}
                </div>
              )
              : (
                <p class="mt-4 text-sm text-ink-3">
                  Your link has no email attached — add one via a family editor, then subscribe from
                  your profile.
                </p>
              )}
          </>
        ),
      },
    ];
    if (canEdit) {
      out.push({
        kicker: "You're an editor",
        title: "Help keep it alive",
        body: (
          <>
            <p>
              Your link can edit the family data. From the menu in the top-right corner you can add
              people and events — a new baby, a wedding, a grandparent who's missing.
            </p>
            <p class="mt-3 text-sm text-ink-3">
              Tip: in a person's notes, type <span class="font-mono text-ink-2">@</span>{" "}
              to link relatives together — that's how the family tree grows.
            </p>
          </>
        ),
      });
    }
    return out;
  }, [firstName, followedGroups, groups, canEdit, subscribed, subscribing, subscribeError]);

  if (!open) return null;
  const last = step === steps.length - 1;
  const current = steps[step];

  return (
    <div class="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="welcome-tour-title"
        class="card w-full max-w-lg p-6 sm:p-8"
      >
        <div class="flex items-start justify-between gap-4">
          <p class="kicker">{current.kicker}</p>
          <button
            type="button"
            class="text-sm font-medium text-ink-3 hover:text-ink"
            onClick={finish}
          >
            Skip tour
          </button>
        </div>
        <h2 id="welcome-tour-title" class="mt-2 text-xl font-semibold tracking-tight">
          {current.title}
        </h2>
        <div class="mt-3 text-sm leading-relaxed text-ink-2">{current.body}</div>

        <div class="mt-8 flex items-center justify-between gap-3">
          <div class="flex gap-1.5" aria-hidden="true">
            {steps.map((_, i) => (
              <span
                key={i}
                class={`size-1.5 rounded-full ${i === step ? "bg-accent" : "bg-line-2"}`}
              />
            ))}
          </div>
          <div class="flex gap-2">
            {step > 0 && (
              <button
                type="button"
                class="btn btn-ghost"
                onClick={() => setStep(step - 1)}
              >
                Back
              </button>
            )}
            <button
              type="button"
              class="btn btn-primary"
              onClick={() => (last ? finish() : setStep(step + 1))}
            >
              {last ? "Start exploring" : "Next"}
            </button>
          </div>
        </div>
        <p class="sr-only" aria-live="polite">
          Step {step + 1} of {steps.length}
        </p>
      </section>
    </div>
  );
}
