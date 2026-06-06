import type { GroupInfo, Person } from "@/lib/model.ts";
import { activeMention, insertMention, type MentionMatch } from "@/lib/mentions.ts";
import { useEffect, useRef, useState } from "preact/hooks";

interface Row {
  id?: string;
  name: string;
  born: string;
  died: string;
  groups: string[];
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
    groups: p.groups.length ? p.groups : fallbackGroup ? [fallbackGroup] : [],
    notes: p.notes || "",
  };
}

function csvEscape(value: unknown): string {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function buildPeopleCsv(rows: Row[]): string {
  const headers = ["id", "name", "born", "died", "groups", "notes"];
  const lines = [headers.join(",")];
  for (const row of rows.filter((r) => r.name || r.born || r.died || r.notes)) {
    lines.push(
      [
        row.id || "",
        row.name,
        row.born || "",
        row.died || "",
        row.groups.join("|"),
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
  const noteInputs = useRef(new Map<number, HTMLTextAreaElement>());

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const draft = JSON.parse(raw) as Row[];
        if (Array.isArray(draft) && draft.length) {
          setRows(draft.map((row) => ({
            ...row,
            born: row.born ?? (row as Row & { date?: string }).date ?? "",
            died: row.died ?? "",
            groups: Array.isArray(row.groups)
              ? row.groups
              : (row as Row & { group?: string }).group
              ? [(row as Row & { group?: string }).group!]
              : [],
          })));
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

  function toggleGroup(index: number, group: string) {
    const current = rows[index].groups;
    updateRow(index, {
      groups: current.includes(group)
        ? current.filter((key) => key !== group)
        : [...current, group],
    });
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
        groups: fallbackGroup ? [fallbackGroup] : [],
        notes: "",
      } satisfies Row,
    ];
    setRows(next);
    persistDraft(next);
  }

  function removeRow(index: number) {
    const next = rows.filter((_, i) => i !== index);
    setRows(
      next.length ? next : [{ name: "", born: "", died: "", groups: [fallbackGroup], notes: "" }],
    );
    persistDraft(next);
  }

  function serverPeople() {
    return nonEmptyRows.map((row) => ({
      id: row.id || undefined,
      name: row.name,
      born: row.born || "",
      died: row.died || null,
      groups: row.groups,
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
      <div class="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div class="flex items-center gap-3">
            <a href={calendarUrl} class="text-sm font-medium text-zinc-500 hover:text-zinc-900">
              View calendar
            </a>
          </div>
          <h1 class="mt-1 text-2xl font-semibold tracking-normal">Edit family dates</h1>
          <p class="mt-1 max-w-2xl text-sm text-zinc-600">
            Changes <strong>Save</strong> to the shared calendar; Download CSV is a backup.
          </p>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <span class="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-600">
            Editing as <strong class="text-zinc-900">{viewerName}</strong>
          </span>
          <button
            type="button"
            onClick={addRow}
            class="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700"
          >
            Add person
          </button>
          <button
            type="button"
            onClick={save}
            class="rounded-md bg-teal-700 px-4 py-2 text-sm font-medium text-white hover:bg-teal-600"
          >
            Save
          </button>
          <button
            type="button"
            onClick={copyCsv}
            class="rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-900 hover:bg-zinc-100"
          >
            Copy CSV
          </button>
          <button
            type="button"
            onClick={downloadCsv}
            class="rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-900 hover:bg-zinc-100"
          >
            Download CSV
          </button>
          <button
            type="button"
            onClick={reset}
            class="rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-500 hover:bg-zinc-100"
          >
            Reset
          </button>
        </div>
      </div>

      {hasDraft && (
        <div class="mb-4 rounded-md border border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-900">
          You have unsaved local changes. Save (or Download CSV) to keep them, or Reset to discard.
        </div>
      )}

      <div class="mb-4 flex flex-wrap items-center gap-3 text-sm text-zinc-600">
        <span>
          <strong>{nonEmptyRows.length}</strong> people · <strong>{datedCount}</strong> with dates ·
          {" "}
          <strong>{nonEmptyRows.length - datedCount}</strong> missing
          {invalidCount
            ? (
              <span class="font-semibold text-red-600">
                · {invalidCount} invalid date{invalidCount === 1 ? "" : "s"}
              </span>
            )
            : null}
        </span>
      </div>

      <section class="overflow-x-auto rounded-md border border-zinc-200 bg-white">
        <table class="w-full min-w-[1120px] border-collapse text-left text-sm">
          <thead class="bg-zinc-100 text-xs uppercase tracking-wide text-zinc-600">
            <tr>
              <th class="w-[18%] px-3 py-3 font-medium">Name</th>
              <th class="w-[17%] px-3 py-3 font-medium">Families</th>
              <th class="w-[15%] px-3 py-3 font-medium">Born</th>
              <th class="w-[15%] px-3 py-3 font-medium">Died</th>
              <th class="px-3 py-3 font-medium">Notes</th>
              <th class="w-16 px-3 py-3 font-medium"></th>
            </tr>
          </thead>
          <tbody class="divide-y divide-zinc-200">
            {rows.map((row, index) => {
              const bornValid = birthDateValid(row.born);
              const diedValid = deathDateValid(row.died);
              const suggestions = mentionMenu?.rowIndex === index
                ? mentionSuggestions(mentionMenu)
                : [];
              return (
                <tr
                  key={row.id || index}
                  id={row.id ? `person-row-${row.id}` : undefined}
                  class={focusedPersonId === row.id
                    ? "bg-teal-50 ring-2 ring-inset ring-teal-500"
                    : ""}
                >
                  <td class="px-3 py-2">
                    <input
                      name="name"
                      value={row.name}
                      onInput={(e) =>
                        updateRow(index, { name: (e.currentTarget as HTMLInputElement).value })}
                      class="w-full rounded-md border border-zinc-300 px-3 py-2 outline-none focus:border-zinc-900"
                      placeholder="Name"
                    />
                    {row.id && (
                      <span class="mt-1 block truncate font-mono text-[10px] text-zinc-400">
                        {row.id}
                      </span>
                    )}
                  </td>
                  <td class="px-3 py-2">
                    <div class="flex flex-wrap gap-1">
                      {groups.map((g) => (
                        <button
                          key={g.key}
                          type="button"
                          aria-pressed={row.groups.includes(g.key)}
                          onClick={() => toggleGroup(index, g.key)}
                          class={`rounded-full border px-2 py-1 text-xs font-medium ${
                            row.groups.includes(g.key)
                              ? "border-teal-700 bg-teal-50 text-teal-900"
                              : "border-zinc-300 bg-white text-zinc-500"
                          }`}
                        >
                          {g.flag} {g.label}
                        </button>
                      ))}
                    </div>
                  </td>
                  <td class="px-3 py-2">
                    <input
                      value={row.born}
                      onInput={(e) =>
                        updateRow(index, { born: (e.currentTarget as HTMLInputElement).value })}
                      class={`w-full rounded-md border px-3 py-2 outline-none focus:border-zinc-900 ${
                        bornValid ? "border-zinc-300" : "border-red-500 bg-red-50"
                      }`}
                      placeholder="1990-05-17 / 05-17"
                    />
                  </td>
                  <td class="px-3 py-2">
                    <input
                      value={row.died}
                      onInput={(e) =>
                        updateRow(index, { died: (e.currentTarget as HTMLInputElement).value })}
                      class={`w-full rounded-md border px-3 py-2 outline-none focus:border-zinc-900 ${
                        diedValid ? "border-zinc-300" : "border-red-500 bg-red-50"
                      }`}
                      placeholder="2020-02-01"
                    />
                  </td>
                  <td class="relative px-3 py-2">
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
                      class="min-h-16 w-full resize-y rounded-md border border-zinc-300 px-3 py-2 outline-none focus:border-zinc-900"
                      placeholder="Optional; type @ to link a person"
                    />
                    {mentionMenu?.rowIndex === index && suggestions.length > 0 && (
                      <div class="absolute left-3 right-3 top-[calc(100%-0.5rem)] z-20 overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-xl">
                        {suggestions.map((person, suggestionIndex) => (
                          <button
                            key={person.id}
                            type="button"
                            class={`flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm ${
                              suggestionIndex === mentionMenu.activeIndex
                                ? "bg-teal-50 text-teal-950"
                                : "hover:bg-zinc-50"
                            }`}
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={() => chooseMention(person)}
                          >
                            <span class="font-medium">{person.name}</span>
                            <span class="font-mono text-xs text-zinc-400">@{person.id}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </td>
                  <td class="px-3 py-2 text-right">
                    <button
                      type="button"
                      onClick={() => removeRow(index)}
                      class="rounded-md px-3 py-2 text-sm text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900"
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <p class="mt-3 text-xs text-zinc-500">
        Born accepts <code>YYYY-MM-DD</code>, <code>MM-DD</code>, or blank. Died requires a full
        {" "}
        <code>YYYY-MM-DD</code> date or blank. Type <code>@</code> in notes to link another person.
      </p>

      <div
        class={`pointer-events-none fixed bottom-4 left-1/2 z-30 -translate-x-1/2 rounded-md bg-zinc-900 px-4 py-2 text-sm text-white shadow-lg transition-all ${
          toast ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"
        }`}
      >
        {toast}
      </div>
    </main>
  );
}
