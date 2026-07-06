import { groupBadgeClass } from "@/lib/group_colors.ts";
import { t } from "@/lib/i18n.ts";
import type { ViewGroup, ViewPerson } from "@/lib/view_data.ts";
import { formatTableDate } from "@/lib/calendar/dates.ts";
import type { TableRow, TableSort, TableSortKey } from "@/lib/calendar/events.ts";
import { LinkedNotes, PersonDate } from "@/components/calendar/text.tsx";

function SortHeader({
  label,
  sortKey,
  sort,
  onToggle,
  align = "left",
}: {
  label: string;
  sortKey: TableSortKey;
  sort: TableSort;
  onToggle: (key: TableSortKey) => void;
  align?: "left" | "right";
}) {
  const active = sort.key === sortKey;
  return (
    <th
      scope="col"
      aria-sort={active ? (sort.dir === 1 ? "ascending" : "descending") : undefined}
      class={`px-4 py-2.5 ${align === "right" ? "text-right" : "text-left"}`}
    >
      <button
        type="button"
        onClick={() => onToggle(sortKey)}
        class={`inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wide ${
          active ? "text-ink" : "text-ink-3 hover:text-ink"
        }`}
      >
        {label}
        <svg
          class={`size-3 ${active ? "" : "invisible"} ${
            active && sort.dir === 1 ? "rotate-180" : ""
          }`}
          viewBox="0 0 12 12"
          fill="none"
          stroke="currentColor"
          stroke-width="1.6"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d="M2.5 4.5L6 8l3.5-3.5" />
        </svg>
      </button>
    </th>
  );
}

/** The sortable "everything upcoming" table view. */
export function CalendarTable({
  rows,
  groups,
  sort,
  onToggleSort,
  personLookup,
  onOpenPerson,
}: {
  rows: TableRow[];
  groups: Record<string, ViewGroup>;
  sort: TableSort;
  onToggleSort: (key: TableSortKey) => void;
  /** Roster keyed by lowercased person id, for resolving @-mentions. */
  personLookup: Map<string, ViewPerson>;
  onOpenPerson: (person: ViewPerson) => void;
}) {
  return (
    <section class="card overflow-x-auto" aria-label={t("calendar.upcoming")}>
      <table class="w-full min-w-[34rem] text-sm">
        <thead>
          <tr class="border-b border-line">
            <SortHeader
              label={t("personForm.name")}
              sortKey="name"
              sort={sort}
              onToggle={onToggleSort}
            />
            <SortHeader
              label={t("calendar.table.birthdate")}
              sortKey="date"
              sort={sort}
              onToggle={onToggleSort}
            />
            <SortHeader
              label={t("calendar.nextBirthday")}
              sortKey="next"
              sort={sort}
              onToggle={onToggleSort}
            />
            <SortHeader
              label={t("calendar.table.age")}
              sortKey="age"
              sort={sort}
              onToggle={onToggleSort}
              align="right"
            />
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const group = row.affiliation ? groups[row.affiliation] : undefined;
            return (
              <tr key={row.key} class="border-b border-line last:border-b-0">
                <td class="px-4 py-2.5">
                  <div class="flex flex-wrap items-center gap-2">
                    {row.person
                      ? (
                        <button
                          type="button"
                          class="text-left font-medium hover:underline"
                          onClick={() => onOpenPerson(row.person!)}
                        >
                          {row.name}
                        </button>
                      )
                      : <span class="font-medium">{row.name}</span>}
                    {group && (
                      <span class={`badge ${groupBadgeClass(group.color)}`}>
                        {group.label}
                      </span>
                    )}
                    {row.badge && <span class="badge bg-inset text-ink-2">{row.badge}</span>}
                  </div>
                  {row.note && (
                    <p class="mt-0.5 text-xs text-ink-3">
                      <LinkedNotes
                        text={row.note}
                        personLookup={personLookup}
                        onOpenPerson={onOpenPerson}
                      />
                    </p>
                  )}
                </td>
                <td class="whitespace-nowrap px-4 py-2.5 align-top tabular-nums text-ink-2">
                  <PersonDate value={row.date}>
                    {formatTableDate(row.date)}
                  </PersonDate>
                </td>
                <td class="whitespace-nowrap px-4 py-2.5 align-top tabular-nums text-ink-2">
                  <PersonDate value={row.nextDate}>
                    {formatTableDate(row.nextDate)}
                  </PersonDate>
                </td>
                <td class="px-4 py-2.5 text-right align-top tabular-nums">
                  {row.age ?? <span class="text-ink-3">—</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {!rows.length && (
        <p class="p-6 text-center text-sm text-ink-3">
          {t("calendar.emptyTable")}
        </p>
      )}
    </section>
  );
}
