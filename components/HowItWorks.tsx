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
 * placeholder gives way to "Rikard Eide", the Norwegian branch pill
 * lights up, and an RE avatar pops in among that branch's members below;
 * then "Dorthe Angaard" repeats the move on the Danish side. Each branch
 * row shows a short stack of initial avatars plus a "+N" count, so the
 * rows read as groups of people. Both arrivals stay until the loop
 * resets. Reduced-motion users get a freeze-frame: form filled in with
 * Rikard, his pill lit, both avatars landed.
 *
 * Single column — built for the welcome tour's phone-sized modal; also
 * shown on /about. Initials follow the branch surnames (Eide/Angaard) so
 * the "family side" reading comes for free.
 */

const BRANCH_A = GROUP_COLORS[1]; // teal — the Norwegian branch
const BRANCH_B = GROUP_COLORS[5]; // pink — the Danish branch

const PERSON_A = { name: "Rikard Eide", initials: "RE" };
const PERSON_B = { name: "Dorthe Angaard", initials: "DA" };

function Caret() {
  return <span class="hiw-caret ml-px inline-block h-3 w-px bg-ink align-text-bottom" />;
}

/** Initial-based avatar in the branch color; overlapped via -ml-* by callers. */
function Avatar({ initials, color, class: className = "" }: {
  initials: string;
  color: GroupColor;
  class?: string;
}) {
  return (
    <span
      class={`grid size-6 place-items-center rounded-full text-[10px] font-semibold ring-2 ring-surface ${color.bg} ${color.text} ${className}`}
    >
      {initials}
    </span>
  );
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
 * A branch row: badge, a stack of member avatars and how many more. The
 * added person's avatar pops into the stack on their beat (`beat`) while
 * `pulse` rings the row in the branch color.
 */
function BranchRow({ label, color, members, arrival, count, pulse, beat }: {
  label: string;
  color: GroupColor;
  members: [string, string];
  arrival: string;
  count: number;
  pulse: string;
  beat: string;
}) {
  return (
    <div
      class={`${pulse} flex items-center justify-between gap-2 rounded-lg border border-line-2 bg-surface px-2.5 py-2`}
    >
      <span class={`badge ${groupBadgeClass(color.key)}`}>{label}</span>
      <span class="flex items-center">
        <Avatar initials={members[0]} color={color} />
        <Avatar initials={members[1]} color={color} class="-ml-2" />
        <Avatar initials={arrival} color={color} class={`${beat} -ml-2`} />
        <span class="ml-1.5 text-[10px] font-medium text-ink-3">+{count}</span>
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
                {PERSON_A.name}
                <Caret />
              </span>
              <span class="hiw-t2 col-start-1 row-start-1 font-medium">
                {PERSON_B.name}
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
            members={["AE", "CE"]}
            arrival={PERSON_A.initials}
            count={9}
            pulse="hiw-g1"
            beat="hiw-n1"
          />
          <BranchRow
            label={t("howItWorks.branchB")}
            color={BRANCH_B}
            members={["MA", "PA"]}
            arrival={PERSON_B.initials}
            count={7}
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
