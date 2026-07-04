import { activeMention, insertMention, type MentionMatch } from "@/lib/mentions.ts";
import { t } from "@/lib/i18n.ts";
import { EVENT_KINDS } from "@/lib/model.ts";
import type { ViewEvent, ViewGroup, ViewPerson } from "@/lib/view_data.ts";
import { useEffect, useRef, useState } from "preact/hooks";

interface EventDraft {
  kind: string;
  title: string;
  date: string;
  groups: string[];
  notes: string;
}

interface MentionMenu {
  match: MentionMatch;
  activeIndex: number;
}

interface Props {
  groups: Record<string, ViewGroup>;
  /** People list, for @-mention suggestions. */
  people: ViewPerson[];
  /** Editor API endpoint (`/api/events/<token>`). */
  saveUrl: string;
  onSaved: (event: ViewEvent) => void;
  onCancel: () => void;
}

const dateValid = (value: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(value) || /^\d{2}-\d{2}$/.test(value);

function toViewEvent(saved: {
  id: string;
  kind: string;
  title: string;
  date: string;
  groups?: string[];
  notes?: string;
}): ViewEvent {
  return {
    id: saved.id,
    kind: saved.kind,
    title: saved.title,
    date: saved.date,
    groups: saved.groups ?? [],
    notes: saved.notes ?? "",
  };
}

/**
 * Add a family event (wedding, baptism, ...) from the calendar. Shell-less, so
 * the calendar swaps it into its detail slide-over in place — the same pattern
 * as `PersonForm`. Submits via PUT and hands the saved event back to `onSaved`.
 */
export function EventForm({ groups, people, saveUrl, onSaved, onCancel }: Props) {
  const [draft, setDraft] = useState<EventDraft>(() => ({
    kind: EVENT_KINDS[0],
    title: "",
    date: "",
    groups: [],
    notes: "",
  }));
  const [menu, setMenu] = useState<MentionMenu | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const titleInput = useRef<HTMLInputElement | null>(null);
  const notesInput = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    titleInput.current?.focus();
  }, []);

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
    if (!draft.title.trim()) return setError(t("eventForm.error.titleRequired"));
    if (!dateValid(draft.date.trim())) {
      return setError(t("eventForm.error.dateFormat"));
    }
    if (!draft.groups.length) return setError(t("eventForm.error.groupRequired"));

    setSaving(true);
    setError("");
    const eventInput = {
      kind: draft.kind,
      title: draft.title,
      date: draft.date.trim(),
      groups: draft.groups,
      notes: draft.notes,
    };
    try {
      const response = await fetch(saveUrl, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ event: eventInput }),
      });
      const body = await response.json();
      if (!response.ok) {
        setError(body.error || t("common.error.saveFailed", { status: response.status }));
        return;
      }
      onSaved(toViewEvent(body.event));
    } catch {
      setError(t("common.error.network"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      class="mt-6 grid gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        save();
      }}
    >
      <label class="grid gap-1.5 text-sm font-medium">
        {t("eventForm.kind")}
        <select
          value={draft.kind}
          onChange={(event) => setDraft({ ...draft, kind: event.currentTarget.value })}
          class="input"
        >
          {EVENT_KINDS.map((kind) => (
            <option key={kind} value={kind}>{t(`eventKind.${kind}`)}</option>
          ))}
        </select>
      </label>
      <label class="grid gap-1.5 text-sm font-medium">
        {t("eventForm.title")}
        <input
          ref={titleInput}
          value={draft.title}
          onInput={(event) => setDraft({ ...draft, title: event.currentTarget.value })}
          class="input"
          placeholder="Bryllupsdag"
        />
      </label>
      <label class="grid gap-1.5 text-sm font-medium">
        {t("eventForm.date")}
        <input
          value={draft.date}
          onInput={(event) => setDraft({ ...draft, date: event.currentTarget.value })}
          placeholder="1992-06-27 / 06-27"
          class="input tabular-nums"
        />
        <span class="text-xs font-normal text-ink-3">
          {t("eventForm.dateHint")}
        </span>
      </label>
      <fieldset>
        <legend class="text-sm font-medium">{t("eventForm.groups")}</legend>
        <p class="mt-1 text-xs text-ink-3">{t("eventForm.groupsHint")}</p>
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
        <label for="event-form-notes">{t("common.notes")}</label>
        <textarea
          id="event-form-notes"
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
          rows={3}
          class="input resize-y leading-6"
          placeholder={t("common.notesPlaceholder")}
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
        <button type="button" class="btn btn-ghost" onClick={onCancel}>
          {t("common.cancel")}
        </button>
        <button type="submit" class="btn btn-primary" disabled={saving}>
          {saving ? t("common.saving") : t("eventForm.submit")}
        </button>
      </div>
    </form>
  );
}
