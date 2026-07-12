import { HowItWorksGraphic } from "@/components/HowItWorks.tsx";
import { groupBadgeClass } from "@/lib/group_colors.ts";
import { t } from "@/lib/i18n.ts";
import type { ViewGroup } from "@/lib/view_data.ts";
import type { ComponentChildren } from "preact";
import { useEffect, useMemo, useState } from "preact/hooks";

interface WelcomeTourProps {
  viewerName: string;
  /** Personal iCal feed URL, ready for the Google/Apple buttons. */
  feedUrl: string;
  hasEmail: boolean;
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
      setSubscribeError(t("tour.email.error"));
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
        kicker: t("tour.welcome.kicker"),
        title: t("tour.welcome.title", { name: firstName }),
        body: (
          <>
            <p>
              {t("tour.welcome.body")}
            </p>
            <p class="mt-3">
              {t("tour.welcome.groupsIntro")}
              {followed.length ? ":" : "."}
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
                <p class="mt-2 rounded-lg border border-dashed border-line-2 px-3.5 py-3 text-sm text-ink-3">
                  {t("tour.welcome.noGroups")}
                </p>
              )}
            <p class="mt-3 text-sm text-ink-3">
              {t("tour.welcome.groupsHint")}{" "}
              <a href="/profile/" class="font-medium text-accent-2 underline underline-offset-2">
                {t("about.profileLink")}
              </a>.
            </p>
          </>
        ),
      },
      {
        kicker: t("tour.feed.kicker"),
        title: t("tour.feed.title"),
        body: (
          <>
            <p>
              {t("tour.feed.body")}
            </p>
            <div class="mt-4 flex flex-wrap gap-2">
              <a
                class="btn btn-primary btn-sm"
                href={googleUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                {t("profile.feed.google")}
              </a>
              <a class="btn btn-ghost btn-sm" href={webcalUrl}>
                {t("profile.feed.apple")}
              </a>
            </div>
            <p class="mt-3 text-sm text-ink-3">
              {t("tour.feed.note")}
            </p>
          </>
        ),
      },
      {
        kicker: t("profile.newsletter.title"),
        title: t("tour.email.title"),
        body: (
          <>
            <p>
              {t("tour.email.body")}
            </p>
            <p class="mt-3">
              <a
                href="/newsletter/example"
                target="_blank"
                rel="noopener noreferrer"
                class="font-medium text-accent-2 underline underline-offset-2"
              >
                {t("newsletter.example.link")}
              </a>
            </p>
            {subscribed
              ? (
                <p class="mt-4 rounded-lg border border-accent/40 bg-accent-soft px-3.5 py-2.5 text-sm font-medium text-accent-2">
                  {t("tour.email.subscribed")}
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
                    {subscribing ? t("tour.email.subscribing") : t("tour.email.subscribe")}
                  </button>
                  {subscribeError && <p class="mt-2 text-sm text-ink-3">{subscribeError}</p>}
                </div>
              )
              : (
                <p class="mt-4 text-sm text-ink-3">
                  {t("tour.email.noEmail")}
                </p>
              )}
          </>
        ),
      },
      {
        kicker: t("tour.contribute.kicker"),
        title: t("tour.contribute.title"),
        body: (
          <>
            <p>
              {t("tour.contribute.body")}
            </p>
            <div class="mt-4">
              <HowItWorksGraphic />
            </div>
            <p class="mt-3">
              {t("tour.contribute.groups")}
            </p>
            <p class="mt-3 text-sm text-ink-3">
              {t("tour.contribute.tip.before")} <span class="font-mono text-ink-2">@</span>{" "}
              {t("tour.contribute.tip.after")}
            </p>
          </>
        ),
      },
    ];
    return out;
  }, [firstName, followedGroups, groups, subscribed, subscribing, subscribeError]);

  if (!open) return null;
  const last = step === steps.length - 1;
  const current = steps[step];

  return (
    <div class="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="welcome-tour-title"
        class="card max-h-full w-full max-w-lg overflow-y-auto p-6 sm:p-8"
      >
        <div class="flex items-start justify-between gap-4">
          <p class="kicker">{current.kicker}</p>
          <button
            type="button"
            class="text-sm font-medium text-ink-3 hover:text-ink"
            onClick={finish}
          >
            {t("tour.skip")}
          </button>
        </div>
        <h2 id="welcome-tour-title" class="mt-2 text-xl font-semibold tracking-tight">
          {current.title}
        </h2>
        <div class="mt-3 text-sm leading-relaxed text-ink-2">{current.body}</div>

        {last && (
          <p class="mt-5 text-sm text-ink-3">
            {t("tour.questions.before")}{" "}
            <a href="/about" class="font-medium text-accent-2 underline underline-offset-2">
              {t("tour.questions.link")}
            </a>{" "}
            {t("tour.questions.after")}
          </p>
        )}

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
                {t("tour.back")}
              </button>
            )}
            <button
              type="button"
              class="btn btn-primary"
              onClick={() => (last ? finish() : setStep(step + 1))}
            >
              {last ? t("tour.start") : t("tour.next")}
            </button>
          </div>
        </div>
        <p class="sr-only" aria-live="polite">
          {t("tour.stepOf", { current: step + 1, total: steps.length })}
        </p>
      </section>
    </div>
  );
}
