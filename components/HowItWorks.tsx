import { GROUP_COLORS, groupBadgeClass, type GroupColor } from "@/lib/group_colors.ts";
import { t } from "@/lib/i18n.ts";

/*
 * A miniature of the product doing the thing, not a diagram about it: a
 * fake "add person" form acts out the two ideas newcomers need — anyone
 * can add a person, and the branch you pick decides where they land. The
 * picker visibly offers "+ Ny gren", so "branches are whatever the family
 * makes of them" is told in-place rather than explained.
 *
 * One CSS loop (.hiw-* in styles.css) plays two beats: the input's
 * placeholder gives way to "Rikard", the Norwegian branch pill lights up,
 * and Rikard drops into that branch's row below; then "Dorthe" repeats
 * the move on the Danish side. Both people stay until the loop resets.
 * Reduced-motion users see a static filled-in state instead.
 *
 * Single column, nothing under 11px — built for the welcome tour's
 * phone-sized modal; also shown on /about.
 */

const BRANCH_A = GROUP_COLORS[1]; // teal — the Norwegian branch
const BRANCH_B = GROUP_COLORS[5]; // pink — the Danish branch

const PERSON_A = "Rikard";
const PERSON_B = "Dorthe";

function Dot({ class: className = "" }: { class?: string }) {
  return <span class={`inline-block size-2 rounded-full border ${className}`} />;
}

function Caret() {
  return <span class="hiw-caret ml-px inline-block h-3 w-px bg-ink align-text-bottom" />;
}

/** One option in the fake branch picker; `beat` lights it up on cue. */
function PickerPill({ label, beat = "", dashed = false }: {
  label: string;
  beat?: string;
  dashed?: boolean;
}) {
  return (
    <span
      class={`${beat} inline-flex items-center rounded-full border bg-surface px-2.5 py-1 text-[11px] font-medium text-ink-2 ${
        dashed ? "border-dashed border-line-2 text-ink-3" : "border-line-2"
      }`}
    >
      {label}
    </span>
  );
}

/**
 * A branch with a couple of members already in it. The named person pops
 * in on their beat (`beat`) while `pulse` rings the row in branch color.
 */
function BranchRow({ label, color, person, pulse, beat }: {
  label: string;
  color: GroupColor;
  person: string;
  pulse: string;
  beat: string;
}) {
  return (
    <div
      class={`${pulse} flex items-center justify-between gap-2 rounded-lg border border-line-2 bg-surface px-2.5 py-2`}
    >
      <span class={`badge ${groupBadgeClass(color.key)}`}>{label}</span>
      <span class="flex items-center gap-1.5">
        <Dot class={`${color.bg} ${color.border}`} />
        <Dot class={`${color.bg} ${color.border}`} />
        <span
          class={`${beat} inline-flex items-center rounded-full border border-line-2 bg-inset px-2 py-0.5 text-[11px] font-medium`}
        >
          {person}
        </span>
      </span>
    </div>
  );
}

export function HowItWorksGraphic() {
  return (
    <figure
      class="rounded-xl border border-line bg-inset/40 p-4"
      aria-label={t("howItWorks.alt")}
    >
      <div aria-hidden="true">
        {/* The mini add-person form */}
        <div class="rounded-lg border border-line bg-surface p-2.5 shadow-sm">
          <div class="rounded-md border border-line-2 bg-inset/50 px-2.5 py-1.5 text-xs">
            {/* Placeholder and both names share one grid cell; the loop
                shows whichever the current beat calls for. */}
            <span class="grid">
              <span class="hiw-ph col-start-1 row-start-1 text-ink-3">
                {t("howItWorks.placeholder")}
              </span>
              <span class="hiw-t1 col-start-1 row-start-1 font-medium">
                {PERSON_A}
                <Caret />
              </span>
              <span class="hiw-t2 col-start-1 row-start-1 font-medium">
                {PERSON_B}
                <Caret />
              </span>
            </span>
          </div>
          <div class="mt-2 flex flex-wrap items-center gap-1.5">
            <span class="text-[11px] text-ink-3">{t("howItWorks.pickBranch")}</span>
            <PickerPill label={t("howItWorks.branchA")} beat="hiw-s1" />
            <PickerPill label={t("howItWorks.branchB")} beat="hiw-s2" />
            <PickerPill label={`+ ${t("howItWorks.newBranch")}`} dashed />
          </div>
        </div>

        {/* The branches the person lands in */}
        <div class="mt-3 grid gap-2">
          <BranchRow
            label={t("howItWorks.branchA")}
            color={BRANCH_A}
            person={PERSON_A}
            pulse="hiw-g1"
            beat="hiw-n1"
          />
          <BranchRow
            label={t("howItWorks.branchB")}
            color={BRANCH_B}
            person={PERSON_B}
            pulse="hiw-g2"
            beat="hiw-n2"
          />
        </div>
      </div>

      <figcaption class="mt-3 text-xs leading-snug text-ink-2">
        {t("howItWorks.caption")}
      </figcaption>
    </figure>
  );
}
