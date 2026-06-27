import type { GroupInfo, Person } from "@/lib/model.ts";
import { activeMention, insertMention, type MentionMatch } from "@/lib/mentions.ts";
import { useEffect, useRef, useState } from "preact/hooks";

interface Row {
  id?: string;
  name: string;
  born: string;
  died: string;
  affiliation: string;
  notes: string;
}

interface Props {
  groups: GroupInfo[];
  people: Person[];
  viewerName: string;
  calendarUrl: string;
  saveUrl: string;
  focusPersonId?: string;
  embedded?: boolean;
}

interface MentionMenu {
  rowIndex: number;
  match: MentionMatch;
  activeIndex: number;
}

const storageKey = "family-calendar-editor-draft";
const birthDateValid = (v: string) =>
  v === "" || /^\d{4}-\d{2}-\d{2}$/.test(v) || /^\d{2}-\d{2}$/.test(v);
const deathDateValid = (v: string) => v === "" || /^\d{4}-\d{2}-\d{2}$/.test(v);

function toRow(p: Person, fallbackGroup = ""): Row {
  return {
    id: p.id,
    name: p.name,
    born: p.born || "",
    died: p.died || "",
    affiliation: p.affiliation || fallbackGroup,
    notes: p.notes || "",
  };
}

function csvEscape(value: unknown): string {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function buildPeopleCsv(rows: Row[]): string {
  const headers = ["id", "name", "born", "died", "affiliation", "notes"];
  const lines = [headers.join(",")];
  for (const row of rows.filter((r) => r.name || r.born || r.died || r.notes)) {
    lines.push(
      [
        row.id || "",
        row.name,
        row.born || "",
        row.died || "",
        row.affiliation || "",
        row.notes || "",
      ]
        .map(csvEscape)
        .join(","),
    );
  }
  return lines.join("\n") + "\n";
}

export function Editor({
  groups,
  people,
  viewerName,
  calendarUrl,
  saveUrl,
  focusPersonId = "",
  embedded = false,
}: Props) {
  const fallbackGroup = groups[0]?.key || "";
  const [rows, setRows] = useState<Row[]>(() => people.map((p) => toRow(p, fallbackGroup)));
  const [toast, setToast] = useState("");
  const [hasDraft, setHasDraft] = useState(false);
  const [focusedPersonId, setFocusedPersonId] = useState(focusPersonId);
  const [mentionMenu, setMentionMenu] = useState<MentionMenu | null>(null);
  const [search, setSearch] = useState("");
  const [groupFilter, setGroupFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState("all");
  const noteInputs = useRef(new Map<number, HTMLTextAreaElement>());
  // Outside-click / Escape close is handled globally by PopoverBehavior via the
  // `data-popover` attribute on the <details>. We keep a ref only to close it
  // programmatically after picking an action.
  const moreMenu = useRef<HTMLDetailsElement | null>(null);

  function closeMoreMenu() {
    moreMenu.current?.removeAttribute("open");
  }

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const draft = JSON.parse(raw) as Row[];
        if (Array.isArray(draft) && draft.length) {
          setRows(draft.map((row) => {
            const legacy = row as Row & { date?: string; group?: string; groups?: string[] };
            return {
              ...row,
              born: row.born ?? legacy.date ?? "",
              died: row.died ?? "",
              affiliation: row.affiliation ?? legacy.group ?? legacy.groups?.[0] ?? fallbackGroup,
            };
          }));
          setHasDraft(true);
        }
      }
    } catch {
      // Ignore malformed local draft.
    }
  }, []);

  useEffect(() => {
    if (!focusedPersonId) return;
    const row = document.getElementById(`person-row-${focusedPersonId}`);
    if (!row) return;
    row.scrollIntoView({ block: "center", behavior: "smooth" });
    requestAnimationFrame(() => row.querySelector<HTMLInputElement>('input[name="name"]')?.focus());
    const timer = setTimeout(() => setFocusedPersonId(""), 2400);
    return () => clearTimeout(timer);
  }, [focusedPersonId, rows]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 2600);
    return () => clearTimeout(timer);
  }, [toast]);

  const invalidCount =
    rows.filter((row) =>
      (!birthDateValid(row.born) || !deathDateValid(row.died)) &&
      (row.name || row.born || row.died)
    ).length;
  const nonEmptyRows = rows.filter((row) => row.name || row.born || row.died || row.notes);
  const datedCount = nonEmptyRows.filter((row) => row.born).length;

  const searchQuery = search.trim().toLowerCase();
  const filtersActive = Boolean(searchQuery) || groupFilter !== "all" || dateFilter !== "all";
  // Freshly added (still empty) rows always stay visible while being authored.
  const visibleRows = rows
    .map((row, index) => ({ row, index }))
    .filter(({ row }) => {
      if (!row.name && !row.born && !row.died && !row.notes) return true;
      if (
        searchQuery &&
        !`${row.name} ${row.id ?? ""} ${row.notes}`.toLowerCase().includes(searchQuery)
      ) {
        return false;
      }
      if (groupFilter !== "all" && row.affiliation !== groupFilter) return false;
      if (dateFilter === "dated" && !row.born) return false;
      if (dateFilter === "missing" && row.born) return false;
      return true;
    });
  const visibleCount =
    visibleRows.filter(({ row }) => row.name || row.born || row.died || row.notes).length;

  function persistDraft(next: Row[]) {
    localStorage.setItem(
      storageKey,
      JSON.stringify(next.filter((row) => row.name || row.born || row.died || row.notes)),
    );
    setHasDraft(true);
  }

  function updateRow(index: number, patch: Partial<Row>) {
    const next = rows.map((row, i) => (i === index ? { ...row, ...patch } : row));
    setRows(next);
    persistDraft(next);
  }

  function updateMentionMenu(index: number, input: HTMLTextAreaElement) {
    const match = activeMention(input.value, input.selectionStart ?? input.value.length);
    setMentionMenu(match ? { rowIndex: index, match, activeIndex: 0 } : null);
  }

  function mentionSuggestions(menu: MentionMenu) {
    return people
      .filter((person) => {
        const query = menu.match.query;
        return person.id.toLowerCase().includes(query) || person.name.toLowerCase().includes(query);
      })
      .slice(0, 6);
  }

  function chooseMention(person: Person) {
    if (!mentionMenu) return;
    const row = rows[mentionMenu.rowIndex];
    const result = insertMention(row.notes, mentionMenu.match, person.id);
    updateRow(mentionMenu.rowIndex, { notes: result.text });
    setMentionMenu(null);
    requestAnimationFrame(() => {
      const input = noteInputs.current.get(mentionMenu.rowIndex);
      input?.focus();
      input?.setSelectionRange(result.cursor, result.cursor);
    });
  }

  function addRow() {
    const next = [
      ...rows,
      {
        name: "",
        born: "",
        died: "",
        affiliation: fallbackGroup,
        notes: "",
      } satisfies Row,
    ];
    setRows(next);
    persistDraft(next);
  }

  function removeRow(index: number) {
    const next = rows.filter((_, i) => i !== index);
    setRows(
      next.length
        ? next
        : [{ name: "", born: "", died: "", affiliation: fallbackGroup, notes: "" }],
    );
    persistDraft(next);
  }

  function serverPeople() {
    return nonEmptyRows.map((row) => ({
      id: row.id || undefined,
      name: row.name,
      born: row.born || "",
      died: row.died || null,
      affiliation: row.affiliation,
      notes: row.notes,
    }));
  }

  async function save() {
    if (invalidCount) return setToast("Fix the highlighted dates first.");

    try {
      const res = await fetch(saveUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ people: serverPeople() }),
      });
      const body = await res.json();
      if (!res.ok) return setToast(`Couldn't save: ${body.error || res.status}`);
      const next = (body.people || []).map((p: Person) => toRow(p, fallbackGroup));
      setRows(next);
      localStorage.removeItem(storageKey);
      setHasDraft(false);
      setToast(`Saved ${next.length} people as ${viewerName}.`);
    } catch {
      setToast("Couldn't reach the server. Use Download CSV as a fallback.");
    }
  }

  function downloadCsv() {
    if (invalidCount) return setToast("Fix the highlighted dates first.");
    const blob = new Blob([buildPeopleCsv(rows)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "people.csv";
    link.click();
    URL.revokeObjectURL(url);
    setToast("Downloaded people.csv backup.");
  }

  async function copyCsv() {
    if (invalidCount) return setToast("Fix the highlighted dates first.");
    try {
      await navigator.clipboard.writeText(buildPeopleCsv(rows));
      setToast("Copied CSV to clipboard.");
    } catch {
      setToast("Couldn't access clipboard — use Download CSV instead.");
    }
  }

  function reset() {
    const next = people.map((p) => toRow(p, fallbackGroup));
    setRows(next);
    localStorage.removeItem(storageKey);
    setHasDraft(false);
    setToast("Reset to the saved calendar.");
  }

  return (
    <main class={embedded ? "" : "mx-auto max-w-6xl px-4 py-8"}>
      <div class="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 class="text-2xl font-semibold tracking-tight">People</h1>
          <p class="mt-1 max-w-2xl text-sm text-ink-2">
            Changes <strong>Save</strong> to the shared calendar; Download CSV is a backup.
          </p>
        </div>
        <div class="flex items-center gap-2">
          <details ref={moreMenu} data-popover class="relative">
            <summary class="btn btn-ghost cursor-pointer list-none [&::-webkit-details-marker]:hidden">
              More
              <svg
                class="size-3 text-ink-3"
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
            </summary>
            <div class="menu">
              <a href={calendarUrl}>View calendar</a>
              <button
                type="button"
                onClick={() => {
                  closeMoreMenu();
                  copyCsv();
                }}
              >
                Copy CSV
              </button>
              <button
                type="button"
                onClick={() => {
                  closeMoreMenu();
                  downloadCsv();
                }}
              >
                Download CSV
              </button>
              <hr />
              <button
                type="button"
                class="text-danger"
                onClick={() => {
                  closeMoreMenu();
                  reset();
                }}
              >
                Reset to saved
              </button>
            </div>
          </details>
          <button type="button" onClick={addRow} class="btn btn-ghost">
            Add person
          </button>
          <button type="button" onClick={save} class="btn btn-primary">
            Save
          </button>
        </div>
      </div>

      {hasDraft && (
        <div class="mb-4 rounded-lg bg-gold-soft px-4 py-2.5 text-sm font-medium text-gold">
          You have unsaved local changes. Save (or Download CSV) to keep them, or Reset to discard.
        </div>
      )}

      <div class="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div class="flex flex-wrap items-center gap-2">
          <input
            type="search"
            value={search}
            onInput={(e) => setSearch((e.currentTarget as HTMLInputElement).value)}
            placeholder="Search people…"
            class="input w-56"
          />
          <select
            value={groupFilter}
            onChange={(e) => setGroupFilter(e.currentTarget.value)}
            class="input w-auto"
          >
            <option value="all">All groups</option>
            {groups.map((g) => <option value={g.key}>{g.label}</option>)}
          </select>
          <select
            value={dateFilter}
            onChange={(e) => setDateFilter(e.currentTarget.value)}
            class="input w-auto"
          >
            <option value="all">All dates</option>
            <option value="dated">With date</option>
            <option value="missing">Missing date</option>
          </select>
        </div>
        <p class="text-sm tabular-nums text-ink-2">
          {filtersActive && (
            <span>
              <strong>{visibleCount}</strong> shown ·{" "}
            </span>
          )}
          <strong>{nonEmptyRows.length}</strong> people · <strong>{datedCount}</strong> with dates ·
          {" "}
          <strong>{nonEmptyRows.length - datedCount}</strong> missing
          {invalidCount
            ? (
              <span class="font-semibold text-danger">
                {" "}· {invalidCount} invalid date{invalidCount === 1 ? "" : "s"}
              </span>
            )
            : null}
        </p>
      </div>

      <section class="card overflow-x-auto">
        <table class="data-table min-w-[1120px]">
          <thead>
            <tr>
              <th class="w-[18%]">Name</th>
              <th class="w-[17%]">Group</th>
              <th class="w-[15%]">Born</th>
              <th class="w-[15%]">Died</th>
              <th>Notes</th>
              <th class="w-16"></th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.map(({ row, index }) => {
              const bornValid = birthDateValid(row.born);
              const diedValid = deathDateValid(row.died);
              const suggestions = mentionMenu?.rowIndex === index
                ? mentionSuggestions(mentionMenu)
                : [];
              return (
                <tr
                  key={row.id || index}
                  id={row.id ? `person-row-${row.id}` : undefined}
                  class={focusedPersonId === row.id ? "bg-accent-soft" : ""}
                >
                  <td>
                    <input
                      name="name"
                      value={row.name}
                      onInput={(e) =>
                        updateRow(index, { name: (e.currentTarget as HTMLInputElement).value })}
                      class="input"
                      placeholder="Name"
                    />
                    {row.id && (
                      <span class="mt-1 block truncate font-mono text-[10px] text-ink-3">
                        {row.id}
                      </span>
                    )}
                  </td>
                  <td>
                    <select
                      value={row.affiliation}
                      onChange={(e) => updateRow(index, { affiliation: e.currentTarget.value })}
                      class={`input w-auto ${row.affiliation ? "" : "input-invalid"}`}
                    >
                      <option value="">—</option>
                      {groups.map((g) => <option key={g.key} value={g.key}>{g.label}</option>)}
                    </select>
                  </td>
                  <td>
                    <input
                      value={row.born}
                      onInput={(e) =>
                        updateRow(index, { born: (e.currentTarget as HTMLInputElement).value })}
                      class={`input tabular-nums ${bornValid ? "" : "input-invalid"}`}
                      placeholder="1990-05-17 / 05-17"
                    />
                  </td>
                  <td>
                    <input
                      value={row.died}
                      onInput={(e) =>
                        updateRow(index, { died: (e.currentTarget as HTMLInputElement).value })}
                      class={`input tabular-nums ${diedValid ? "" : "input-invalid"}`}
                      placeholder="2020-02-01"
                    />
                  </td>
                  <td class="relative">
                    <textarea
                      ref={(input) => {
                        if (input) noteInputs.current.set(index, input);
                        else noteInputs.current.delete(index);
                      }}
                      value={row.notes}
                      onInput={(e) => {
                        const input = e.currentTarget as HTMLTextAreaElement;
                        updateRow(index, { notes: input.value });
                        updateMentionMenu(index, input);
                      }}
                      onClick={(e) => updateMentionMenu(index, e.currentTarget)}
                      onKeyDown={(event) => {
                        if (!mentionMenu || mentionMenu.rowIndex !== index || !suggestions.length) {
                          return;
                        }
                        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                          event.preventDefault();
                          const direction = event.key === "ArrowDown" ? 1 : -1;
                          setMentionMenu({
                            ...mentionMenu,
                            activeIndex:
                              (mentionMenu.activeIndex + direction + suggestions.length) %
                              suggestions.length,
                          });
                        } else if (event.key === "Enter") {
                          event.preventDefault();
                          chooseMention(suggestions[mentionMenu.activeIndex]);
                        } else if (event.key === "Escape") {
                          setMentionMenu(null);
                        }
                      }}
                      onBlur={() => setTimeout(() => setMentionMenu(null), 120)}
                      class="input min-h-16 resize-y"
                      placeholder="Optional; type @ to link a person"
                    />
                    {mentionMenu?.rowIndex === index && suggestions.length > 0 && (
                      <div class="absolute left-3 right-3 top-[calc(100%-0.5rem)] z-20 overflow-hidden rounded-lg border border-line bg-surface shadow-pop">
                        {suggestions.map((person, suggestionIndex) => (
                          <button
                            key={person.id}
                            type="button"
                            class={`flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm ${
                              suggestionIndex === mentionMenu.activeIndex
                                ? "bg-accent-soft text-accent-2"
                                : "hover:bg-inset"
                            }`}
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={() => chooseMention(person)}
                          >
                            <span class="font-medium">{person.name}</span>
                            <span class="font-mono text-xs text-ink-3">@{person.id}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </td>
                  <td class="text-right">
                    <button
                      type="button"
                      onClick={() => removeRow(index)}
                      class="btn btn-ghost btn-sm text-ink-2"
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!visibleRows.length && (
          <p class="px-4 py-8 text-center text-sm text-ink-3">
            No people match these filters.
          </p>
        )}
      </section>

      <p class="mt-3 text-xs text-ink-3">
        Born accepts <code>YYYY-MM-DD</code>, <code>MM-DD</code>, or blank. Died requires a full
        {" "}
        <code>YYYY-MM-DD</code> date or blank. Type <code>@</code> in notes to link another person.
      </p>

      <div
        role="status"
        class={`toast fixed bottom-4 left-1/2 z-30 -translate-x-1/2 ${toast ? "visible" : ""}`}
      >
        {toast}
      </div>
    </main>
  );
}
