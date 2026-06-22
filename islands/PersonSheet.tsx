import { activeMention, insertMention, type MentionMatch } from "@/lib/mentions.ts";
import type { ViewGroup, ViewPerson } from "@/lib/view_data.ts";
import { useEffect, useRef, useState } from "preact/hooks";

interface PersonDraft {
  name: string;
  born: string;
  died: string;
  groups: string[];
  notes: string;
}

interface MentionMenu {
  match: MentionMatch;
  activeIndex: number;
}

interface Props {
  open: boolean;
  /** The person being edited, or null to add a new one. */
  person: ViewPerson | null;
  groups: Record<string, ViewGroup>;
  /** People list, for @-mention suggestions. */
  people: ViewPerson[];
  /** Editor API endpoint (`/api/people/<token>`). */
  saveUrl: string;
  onClose: () => void;
  onSaved: (person: ViewPerson) => void;
  /** Lock body scroll while open. Off when a parent already owns the lock. */
  lockScroll?: boolean;
}

const blankDraft: PersonDraft = { name: "", born: "", died: "", groups: [], notes: "" };

const birthDateValid = (value: string) =>
  value === "" || /^\d{4}-\d{2}-\d{2}$/.test(value) || /^\d{2}-\d{2}$/.test(value);
const deathDateValid = (value: string) => value === "" || /^\d{4}-\d{2}-\d{2}$/.test(value);

function toViewPerson(saved: {
  id: string;
  name: string;
  born?: string | null;
  died?: string | null;
  groups?: string[];
  notes?: string;
}): ViewPerson {
  return {
    id: saved.id,
    name: saved.name,
    date: saved.born || "",
    died: saved.died || "",
    groups: saved.groups || [],
    group: saved.groups?.[0] || "",
    notes: saved.notes || "",
    type: "birthday",
  };
}

/**
 * Slide-over to add or edit a person, with the shared `@person` note mentions.
 * `person === null` is add mode (POST-equivalent PUT); otherwise it edits via
 * PATCH. Self-contained: owns its draft, validation, save and open/close
 * animation, and reports the saved person back through `onSaved`.
 */
export function PersonSheet(
  { open, person, groups, people, saveUrl, onClose, onSaved, lockScroll = true }: Props,
) {
  const [rendered, setRendered] = useState(false);
  const [shown, setShown] = useState(false);
  const [draft, setDraft] = useState<PersonDraft>(blankDraft);
  const [menu, setMenu] = useState<MentionMenu | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const notesInput = useRef<HTMLTextAreaElement | null>(null);
  const closeButton = useRef<HTMLButtonElement | null>(null);
  const trigger = useRef<HTMLElement | null>(null);
  const closeTimer = useRef<number | null>(null);
  const editing = Boolean(person);

  // Mount, then animate in/out as `open` flips.
  useEffect(() => {
    if (open) {
      if (closeTimer.current !== null) {
        clearTimeout(closeTimer.current);
        closeTimer.current = null;
      }
      trigger.current = document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
      setRendered(true);
      const id = requestAnimationFrame(() => {
        setShown(true);
        closeButton.current?.focus();
      });
      return () => cancelAnimationFrame(id);
    }
    setShown(false);
    closeTimer.current = setTimeout(() => {
      setRendered(false);
      closeTimer.current = null;
    }, 200);
  }, [open]);

  // Reset the form whenever a fresh subject is opened.
  useEffect(() => {
    if (!open) return;
    setDraft(
      person
        ? {
          name: person.name,
          born: person.date,
          died: person.died,
          groups: person.groups,
          notes: person.notes,
        }
        : blankDraft,
    );
    setMenu(null);
    setError("");
  }, [open, person?.id]);

  useEffect(() => {
    if (!rendered) return;
    const previousOverflow = document.body.style.overflow;
    if (lockScroll) document.body.style.overflow = "hidden";
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    globalThis.addEventListener("keydown", onKeyDown);
    return () => {
      if (lockScroll) document.body.style.overflow = previousOverflow;
      globalThis.removeEventListener("keydown", onKeyDown);
      trigger.current?.focus();
    };
  }, [rendered]);

  function toggleGroup(group: string) {
    setDraft((current) => ({
      ...current,
      groups: current.groups.includes(group)
        ? current.groups.filter((key) => key !== group)
        : [...current.groups, group],
    }));
  }

  function updateMenu(input: HTMLTextAreaElement) {
    const match = activeMention(input.value, input.selectionStart ?? input.value.length);
    setMenu(match ? { match, activeIndex: 0 } : null);
  }

  function suggestions(current: MentionMenu) {
    const query = current.match.query;
    return people
      .filter((p) => p.id.toLowerCase().includes(query) || p.name.toLowerCase().includes(query))
      .slice(0, 6);
  }

  function choose(p: ViewPerson) {
    if (!menu) return;
    const result = insertMention(draft.notes, menu.match, p.id);
    setDraft((current) => ({ ...current, notes: result.text }));
    setMenu(null);
    requestAnimationFrame(() => {
      notesInput.current?.focus();
      notesInput.current?.setSelectionRange(result.cursor, result.cursor);
    });
  }

  async function save() {
    if (!draft.name.trim()) return setError("Name is required.");
    if (!birthDateValid(draft.born)) {
      return setError("Born must be YYYY-MM-DD, MM-DD, or empty.");
    }
    if (!deathDateValid(draft.died)) {
      return setError("Died must be YYYY-MM-DD or empty.");
    }

    setSaving(true);
    setError("");
    const personInput = {
      name: draft.name,
      born: draft.born || null,
      died: draft.died || null,
      groups: draft.groups,
      notes: draft.notes,
    };
    try {
      const response = await fetch(saveUrl, {
        method: editing ? "PATCH" : "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(
          editing ? { id: person!.id, person: personInput } : { person: personInput },
        ),
      });
      const body = await response.json();
      if (!response.ok) {
        setError(body.error || `Couldn't save (${response.status}).`);
        return;
      }
      onSaved(toViewPerson(body.person));
    } catch {
      setError("Couldn't reach the server.");
    } finally {
      setSaving(false);
    }
  }

  if (!rendered) return null;

  return (
    <div
      class="backdrop fixed inset-0 z-40 flex items-end bg-black/30 sm:items-stretch sm:justify-end"
      onClick={onClose}
    >
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="person-sheet-title"
        class={`sheet flex max-h-[88vh] w-full flex-col overflow-y-auto rounded-t-2xl border-t border-line bg-surface p-6 shadow-pop sm:max-h-none sm:w-[26rem] sm:rounded-none sm:border-t-0 sm:border-l ${
          shown ? "is-open" : ""
        }`}
        onClick={(event) => event.stopPropagation()}
      >
        <div class="mx-auto mb-4 h-1 w-10 rounded-full bg-line-2 sm:hidden" />
        <div class="flex items-start justify-between gap-4">
          <div>
            <p class="kicker">{editing ? "Edit person" : "Add person"}</p>
            <h2 id="person-sheet-title" class="mt-1 text-xl font-semibold tracking-tight">
              {editing ? person!.name : "New person"}
            </h2>
          </div>
          <button
            ref={closeButton}
            type="button"
            class="grid size-8 shrink-0 place-items-center rounded-full border border-line-2 bg-surface text-ink-2 hover:bg-inset hover:text-ink"
            onClick={onClose}
            aria-label="Close"
          >
            <svg
              class="size-3.5"
              viewBox="0 0 14 14"
              fill="none"
              stroke="currentColor"
              stroke-width="1.6"
              stroke-linecap="round"
              aria-hidden="true"
            >
              <path d="M2 2l10 10M12 2L2 12" />
            </svg>
          </button>
        </div>

        <form
          class="mt-6 grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            save();
          }}
        >
          <label class="grid gap-1.5 text-sm font-medium">
            Name
            <input
              value={draft.name}
              onInput={(event) => setDraft({ ...draft, name: event.currentTarget.value })}
              class="input"
            />
          </label>
          {editing && (
            <label class="grid gap-1.5 text-sm font-medium">
              ID
              <input
                value={person!.id}
                readOnly
                class="input bg-inset font-mono text-xs text-ink-2"
              />
            </label>
          )}
          <div class="grid grid-cols-2 gap-3">
            <label class="grid gap-1.5 text-sm font-medium">
              Born
              <input
                value={draft.born}
                onInput={(event) => setDraft({ ...draft, born: event.currentTarget.value })}
                placeholder="YYYY-MM-DD / MM-DD"
                class="input min-w-0"
              />
            </label>
            <label class="grid gap-1.5 text-sm font-medium">
              Died
              <input
                value={draft.died}
                onInput={(event) => setDraft({ ...draft, died: event.currentTarget.value })}
                placeholder="YYYY-MM-DD"
                class="input min-w-0"
              />
            </label>
          </div>
          <fieldset>
            <legend class="text-sm font-medium">Groups</legend>
            <div class="mt-2 flex flex-wrap gap-2">
              {Object.entries(groups).map(([key, group]) => (
                <button
                  key={key}
                  type="button"
                  class="chip"
                  aria-pressed={draft.groups.includes(key)}
                  onClick={() => toggleGroup(key)}
                >
                  {group.label}
                </button>
              ))}
            </div>
          </fieldset>
          <div class="relative grid gap-1.5 text-sm font-medium">
            <label for="person-sheet-notes">Notes</label>
            <textarea
              id="person-sheet-notes"
              ref={notesInput}
              value={draft.notes}
              onInput={(event) => {
                setDraft({ ...draft, notes: event.currentTarget.value });
                updateMenu(event.currentTarget);
              }}
              onClick={(event) => updateMenu(event.currentTarget)}
              onKeyDown={(event) => {
                if (!menu) return;
                const options = suggestions(menu);
                if (!options.length) return;
                if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                  event.preventDefault();
                  const direction = event.key === "ArrowDown" ? 1 : -1;
                  setMenu({
                    ...menu,
                    activeIndex: (menu.activeIndex + direction + options.length) % options.length,
                  });
                } else if (event.key === "Enter") {
                  event.preventDefault();
                  choose(options[menu.activeIndex]);
                } else if (event.key === "Escape") {
                  setMenu(null);
                }
              }}
              onBlur={() => setTimeout(() => setMenu(null), 120)}
              rows={5}
              class="input resize-y leading-6"
              placeholder="Optional; type @ to link a person"
            />
            {menu && suggestions(menu).length > 0 && (
              <div class="absolute left-0 right-0 top-full z-20 mt-1 overflow-hidden rounded-lg border border-line bg-surface shadow-pop">
                {suggestions(menu).map((p, index) => (
                  <button
                    key={p.id}
                    type="button"
                    class={`flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm ${
                      index === menu.activeIndex ? "bg-accent-soft text-accent-2" : "hover:bg-inset"
                    }`}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => choose(p)}
                  >
                    <span class="font-medium">{p.name}</span>
                    <span class="font-mono text-xs text-ink-3">@{p.id}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          {error && (
            <p class="rounded-lg bg-danger-soft px-3 py-2 text-sm font-medium text-danger">
              {error}
            </p>
          )}
          <div class="grid grid-cols-2 gap-2">
            <button type="button" class="btn btn-ghost" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" class="btn btn-primary" disabled={saving}>
              {saving ? "Saving…" : editing ? "Save changes" : "Add person"}
            </button>
          </div>
        </form>
      </aside>
    </div>
  );
}
