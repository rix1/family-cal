import { t } from "@/lib/i18n.ts";
import type { GroupInfo } from "@/lib/model.ts";

interface Props {
  groups: GroupInfo[];
  /** Member names per group key, for the expandable preview under each card. */
  members: Record<string, string[]>;
  /** Group keys rendered pre-checked. */
  selected?: string[];
}

/**
 * Checkbox cards for choosing which groups to follow, with an expandable
 * member preview so newcomers can see who a "branch" actually is. Submits as
 * repeated `groups` form fields; used by the profile editor and the invite page.
 */
export function GroupPicker({ groups, members, selected = [] }: Props) {
  return (
    <div class="grid gap-2 sm:grid-cols-2">
      {groups.map((group) => {
        const names = members[group.key] ?? [];
        return (
          <div class="rounded-lg border border-line-2 text-sm has-checked:border-accent has-checked:bg-accent-soft">
            <label class="flex cursor-pointer items-start gap-3 rounded-t-lg px-3 py-2.5 font-medium hover:bg-inset has-checked:text-accent-2">
              <input
                type="checkbox"
                name="groups"
                value={group.key}
                checked={selected.includes(group.key)}
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
            {names.length
              ? (
                <details class="border-t border-line-2/60 px-3 py-2">
                  <summary class="cursor-pointer text-xs font-medium text-ink-3 hover:text-ink-2">
                    {names.length === 1
                      ? t("profile.groups.memberOne")
                      : t("profile.groups.memberCount", { count: names.length })}
                  </summary>
                  <p class="mt-1.5 text-xs font-normal leading-relaxed text-ink-2">
                    {names.join(", ")}
                  </p>
                </details>
              )
              : (
                <p class="border-t border-line-2/60 px-3 py-2 text-xs text-ink-3">
                  {t("profile.groups.membersNone")}
                </p>
              )}
          </div>
        );
      })}
    </div>
  );
}
