import { GROUP_COLORS, PERSONAL_GROUP_COLOR } from "@/lib/group_colors.ts";
import { t } from "@/lib/i18n.ts";
import type { ComponentChildren } from "preact";

/*
 * One-glance figure teaching the two distinctions newcomers trip on
 * (docs/personal-groups.md): people live in a *branch* (shared) or in *your
 * list* (private until shared), and calendar dates come from people
 * (birthdays) and family events (milestones) — both recurring every year.
 *
 * Quiet boxes-and-lines: hairline borders, muted ink, small-caps kickers, a
 * faint dot grid, group colors only where they mean something. Pure markup on
 * theme tokens, so light/dark and both locales come for free. Used in the
 * welcome tour's "contribute" step and on /about.
 *
 * One CSS loop (.hiw-* in styles.css) builds the Norwegian branch while the
 * Danish one sits fully established: three people pop in one at a time, each
 * birthday landing on the strip a beat later; then Emils dåpsdag chip fades
 * in and lands too. The strip ends up as the sum of the rows above — 3 + 3
 * birthdays plus the two events, 8 dots. Reduced-motion users see the
 * finished state statically.
 */

const BRANCH_A = GROUP_COLORS[1]; // teal
const BRANCH_B = GROUP_COLORS[5]; // pink

const DOT_A = `${BRANCH_A.bg} ${BRANCH_A.border}`;
const DOT_B = `${BRANCH_B.bg} ${BRANCH_B.border}`;

/* Calendar strip: day → dot. The pink side is static; the teal hiw-d1..d3
   birthdays land as each person joins, and hiw-d4 is the dåpsdag. */
const CAL_DOTS: Record<number, string> = {
  1: `hiw-d1 ${DOT_A}`,
  3: DOT_B,
  5: `hiw-d2 ${DOT_A}`,
  6: `hiw-d4 ${DOT_A}`,
  8: DOT_B,
  10: `hiw-d3 ${DOT_A}`,
  11: DOT_B,
  13: DOT_B,
};

function Dot({ class: className = "" }: { class?: string }) {
  return <span class={`inline-block size-2 rounded-full border ${className}`} />;
}

function RecurBadge() {
  return (
    <span class="inline-flex items-center gap-1 text-[10px] font-medium text-ink-3">
      <svg
        class="size-2.5"
        viewBox="0 0 12 12"
        fill="none"
        stroke="currentColor"
        stroke-width="1.4"
        stroke-linecap="round"
        aria-hidden="true"
      >
        <path d="M10 6a4 4 0 1 1-1.2-2.85M8.9 1.5v1.8h1.8" />
      </svg>
      {t("howItWorks.everyYear")}
    </span>
  );
}

function LockGlyph() {
  return (
    <svg
      class="size-3 text-ink-3"
      viewBox="0 0 12 12"
      fill="none"
      stroke="currentColor"
      stroke-width="1.3"
      stroke-linecap="round"
      aria-hidden="true"
    >
      <rect x="2.5" y="5.5" width="7" height="5" rx="1" />
      <path d="M4 5.5V4a2 2 0 0 1 4 0v1.5" />
    </svg>
  );
}

function GroupCard(
  { label, dots, caption, dashed, glyph }: {
    label: string;
    dots: ComponentChildren;
    caption?: string;
    dashed?: boolean;
    glyph?: ComponentChildren;
  },
) {
  return (
    <div
      class={`rounded-lg border bg-surface px-2.5 py-2 ${
        dashed ? "border-dashed border-line-2" : "border-line-2"
      }`}
    >
      <div class="flex items-center justify-between gap-1">
        <p class="truncate text-[11px] font-semibold">{label}</p>
        {glyph}
      </div>
      <div class="mt-1.5 flex gap-1">{dots}</div>
      {caption && <p class="mt-1.5 text-[10px] leading-snug text-ink-3">{caption}</p>}
    </div>
  );
}

/** Thin vertical connector between rows; `at` positions it horizontally. */
function Connector({ at }: { at: string }) {
  return (
    <div class="relative h-4" aria-hidden="true">
      <span class={`absolute top-0 h-full w-px bg-line-2 ${at}`} />
    </div>
  );
}

export function HowItWorksGraphic() {
  return (
    <figure
      class="rounded-xl border border-line bg-inset/40 p-4"
      style={{
        backgroundImage: "radial-gradient(var(--color-line-2) 0.5px, transparent 0.5px)",
        backgroundSize: "14px 14px",
      }}
      aria-label={t("howItWorks.alt")}
    >
      {/* Row 1 — where people live */}
      <figcaption class="kicker">{t("howItWorks.who")}</figcaption>
      <div class="mt-2 grid grid-cols-3 gap-2">
        <GroupCard
          label={t("howItWorks.branchA")}
          dots={
            <>
              <Dot class={`hiw-p1 ${DOT_A}`} />
              <Dot class={`hiw-p2 ${DOT_A}`} />
              <Dot class={`hiw-p3 ${DOT_A}`} />
            </>
          }
        />
        <GroupCard
          label={t("howItWorks.branchB")}
          dots={
            <>
              <Dot class={DOT_B} />
              <Dot class={DOT_B} />
              <Dot class={DOT_B} />
            </>
          }
        />
        <GroupCard
          label={t("howItWorks.myList")}
          dashed
          glyph={<LockGlyph />}
          caption={t("howItWorks.onlyYou")}
          dots={
            <>
              <Dot class={`${PERSONAL_GROUP_COLOR.bg} ${PERSONAL_GROUP_COLOR.border}`} />
              <Dot class={`${PERSONAL_GROUP_COLOR.bg} ${PERSONAL_GROUP_COLOR.border}`} />
            </>
          }
        />
      </div>

      {
        /* Row 2 — milestone events beyond birthdays, one tagged to each
          branch. Birthdays ride along with the people in row 1. */
      }
      <Connector at="left-[16%]" />
      <p class="kicker">{t("howItWorks.events")}</p>
      <div class="mt-2 flex flex-wrap gap-2">
        <span class="hiw-ev inline-flex items-center gap-2 rounded-full border border-line-2 bg-surface px-2.5 py-1 text-[11px] font-medium">
          <Dot class={DOT_A} />
          {t("howItWorks.christeningSample")}
          <RecurBadge />
        </span>
        <span class="inline-flex items-center gap-2 rounded-full border border-line-2 bg-surface px-2.5 py-1 text-[11px] font-medium">
          <Dot class={DOT_B} />
          {t("howItWorks.weddingSample")}
          <RecurBadge />
        </span>
      </div>

      {/* Row 3 — the calendar strip they land on */}
      <Connector at="left-[10%]" />
      <p class="kicker">{t("howItWorks.calendar")}</p>
      <div class="mt-2 rounded-lg border border-line-2 bg-surface p-2">
        <div class="grid grid-cols-[repeat(14,minmax(0,1fr))] gap-px" aria-hidden="true">
          {Array.from(
            { length: 14 },
            (_, day) => (
              <span class="grid h-6 place-items-center rounded-sm bg-inset/70">
                {CAL_DOTS[day] && <Dot class={CAL_DOTS[day]} />}
              </span>
            ),
          )}
        </div>
        <p class="mt-1.5 text-[10px] text-ink-3">
          <span class="font-medium text-ink-2">{t("howItWorks.youFollow")}</span>{" "}
          {t("howItWorks.footer")}
        </p>
      </div>
    </figure>
  );
}
