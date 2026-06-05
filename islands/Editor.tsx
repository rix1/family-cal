import type { GroupInfo, Person } from "@/lib/model.ts";
import { useEffect, useState } from "preact/hooks";

interface Row {
  id?: string;
  name: string;
  date: string;
  type: "birthday" | "anniversary";
  group: string;
  notes: string;
  died?: string;
}

interface Props {
  groups: GroupInfo[];
  people: Person[];
  viewerName: string;
  calendarUrl: string;
  saveUrl: string;
}

const storageKey = "family-calendar-editor-draft";
const dateValid = (v: string) =>
  v === "" || /^\d{4}-\d{2}-\d{2}$/.test(v) || /^\d{2}-\d{2}$/.test(v);

function toRow(p: Person, fallbackGroup = ""): Row {
  return {
    id: p.id,
    name: p.name,
    date: p.born || "",
    type: "birthday",
    group: p.groups[0] || fallbackGroup,
    notes: p.notes || "",
    died: p.died || "",
  };
}

function csvEscape(value: unknown): string {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function buildPeopleCsv(rows: Row[]): string {
  const headers = ["id", "name", "born", "died", "groups", "notes"];
  const lines = [headers.join(",")];
  for (const row of rows.filter((r) => r.name || r.date || r.notes)) {
    lines.push(
      [row.id || "", row.name, row.date || "", row.died || "", row.group || "", row.notes || ""]
        .map(csvEscape)
        .join(","),
    );
  }
  return lines.join("\n") + "\n";
}

export function Editor({ groups, people, viewerName, calendarUrl, saveUrl }: Props) {
  const fallbackGroup = groups[0]?.key || "";
  const [rows, setRows] = useState<Row[]>(() => people.map((p) => toRow(p, fallbackGroup)));
  const [toast, setToast] = useState("");
  const [hasDraft, setHasDraft] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const draft = JSON.parse(raw) as Row[];
        if (Array.isArray(draft) && draft.length) {
          setRows(draft);
          setHasDraft(true);
        }
      }
    } catch {
      // Ignore malformed local draft.
    }
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 2600);
    return () => clearTimeout(timer);
  }, [toast]);

  const invalidCount = rows.filter((row) => !dateValid(row.date) && (row.name || row.date)).length;
  const nonEmptyRows = rows.filter((row) => row.name || row.date || row.notes);
  const datedCount = nonEmptyRows.filter((row) => row.date).length;

  function persistDraft(next: Row[]) {
    localStorage.setItem(
      storageKey,
      JSON.stringify(next.filter((row) => row.name || row.date || row.notes)),
    );
    setHasDraft(true);
  }

  function updateRow(index: number, patch: Partial<Row>) {
    const next = rows.map((row, i) => (i === index ? { ...row, ...patch } : row));
    setRows(next);
    persistDraft(next);
  }

  function addRow() {
    const next = [
      ...rows,
      { name: "", date: "", type: "birthday", group: fallbackGroup, notes: "" } satisfies Row,
    ];
    setRows(next);
    persistDraft(next);
  }

  function removeRow(index: number) {
    const next = rows.filter((_, i) => i !== index);
    setRows(
      next.length
        ? next
        : [{ name: "", date: "", type: "birthday", group: fallbackGroup, notes: "" }],
    );
    persistDraft(next);
  }

  function serverPeople() {
    return nonEmptyRows.map((row) => ({
      id: row.id || undefined,
      name: row.name,
      born: row.date || "",
      died: row.died || null,
      groups: row.group ? [row.group] : [],
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
    <main class="mx-auto max-w-6xl px-4 py-8">
      <div class="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div class="flex items-center gap-3">
            <a
              href={calendarUrl}
              class="text-sm font-medium text-zinc-500 hover:text-zinc-900"
            >
              ← Calendar
            </a>
            <a href="/about" class="text-sm font-medium text-zinc-500 hover:text-zinc-900">
              About/API
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
        <table class="w-full min-w-[820px] border-collapse text-left text-sm">
          <thead class="bg-zinc-100 text-xs uppercase tracking-wide text-zinc-600">
            <tr>
              <th class="w-[22%] px-3 py-3 font-medium">Name</th>
              <th class="w-[15%] px-3 py-3 font-medium">Family</th>
              <th class="w-[14%] px-3 py-3 font-medium">Type</th>
              <th class="w-[17%] px-3 py-3 font-medium">Date</th>
              <th class="px-3 py-3 font-medium">Notes</th>
              <th class="w-16 px-3 py-3 font-medium"></th>
            </tr>
          </thead>
          <tbody class="divide-y divide-zinc-200">
            {rows.map((row, index) => {
              const valid = dateValid(row.date);
              return (
                <tr key={row.id || index}>
                  <td class="px-3 py-2">
                    <input
                      value={row.name}
                      onInput={(e) =>
                        updateRow(index, { name: (e.currentTarget as HTMLInputElement).value })}
                      class="w-full rounded-md border border-zinc-300 px-3 py-2 outline-none focus:border-zinc-900"
                      placeholder="Name"
                    />
                  </td>
                  <td class="px-3 py-2">
                    <select
                      value={row.group}
                      onChange={(e) =>
                        updateRow(index, { group: (e.currentTarget as HTMLSelectElement).value })}
                      class="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 outline-none focus:border-zinc-900"
                    >
                      {groups.map((g) => (
                        <option key={g.key} value={g.key}>{g.flag} {g.label}</option>
                      ))}
                    </select>
                  </td>
                  <td class="px-3 py-2">
                    <select
                      value={row.type}
                      onChange={(e) =>
                        updateRow(index, {
                          type: (e.currentTarget as HTMLSelectElement).value as Row["type"],
                        })}
                      class="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 outline-none focus:border-zinc-900"
                    >
                      <option value="birthday">birthday</option>
                      <option value="anniversary">anniversary</option>
                    </select>
                  </td>
                  <td class="px-3 py-2">
                    <input
                      value={row.date}
                      onInput={(e) =>
                        updateRow(index, { date: (e.currentTarget as HTMLInputElement).value })}
                      class={`w-full rounded-md border px-3 py-2 outline-none focus:border-zinc-900 ${
                        valid ? "border-zinc-300" : "border-red-500 bg-red-50"
                      }`}
                      placeholder="1990-05-17 / 05-17"
                    />
                  </td>
                  <td class="px-3 py-2">
                    <input
                      value={row.notes}
                      onInput={(e) =>
                        updateRow(index, { notes: (e.currentTarget as HTMLInputElement).value })}
                      class="w-full rounded-md border border-zinc-300 px-3 py-2 outline-none focus:border-zinc-900"
                      placeholder="Optional"
                    />
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
        Date accepts <code>YYYY-MM-DD</code> (full date, enables age), <code>MM-DD</code>{" "}
        (recurring, year unknown), or leave blank if unknown.
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
