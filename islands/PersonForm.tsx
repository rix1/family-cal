import { NEW_BRANCH_PREFIX, PERSONAL_AFFILIATION } from "@/lib/groups.ts";
import { activeMention, insertMention, type MentionMatch } from "@/lib/mentions.ts";
import { t } from "@/lib/i18n.ts";
import type { ViewGroup, ViewPerson } from "@/lib/view_data.ts";
import { useEffect, useMemo, useRef, useState } from "preact/hooks";

interface PersonDraft {
  name: string;
  born: string;
  died: string;
  affiliation: string;
  notes: string;
}

interface MentionMenu {
  match: MentionMatch;
  activeIndex: number;
}

/** A group the save created (or resolved to) that the client didn't know. */
export interface SavedGroup extends ViewGroup {
  key: string;
}

interface Props {
  /** The person being edited, or null to add a new one. */
  person: ViewPerson | null;
  groups: Record<string, ViewGroup>;
  /** The viewer's own list key, or null until its first use creates it. */
  personalKey: string | null;
  /** People list, for @-mention suggestions. */
  people: ViewPerson[];
  /** Editor API endpoint (`/api/people/<token>`). */
  saveUrl: string;
  onSaved: (person: ViewPerson, newGroup?: SavedGroup) => void;
  onCancel: () => void;
}

interface AffiliationOption {
  value: string;
  label: string;
  /** "branch" files under a family branch; "personal" under the viewer's own list; "new" creates a branch. */
  kind: "branch" | "personal" | "new";
}

const birthDateValid = (value: string) =>
  value === "" || /^\d{4}-\d{2}-\d{2}$/.test(value) || /^\d{2}-\d{2}$/.test(value);
const deathDateValid = (value: string) => value === "" || /^\d{4}-\d{2}-\d{2}$/.test(value);

function toViewPerson(saved: {
  id: string;
  name: string;
  born?: string | null;
  died?: string | null;
  affiliation?: string;
  notes?: string;
}): ViewPerson {
  return {
    id: saved.id,
    name: saved.name,
    date: saved.born || "",
    died: saved.died || "",
    affiliation: saved.affiliation || "",
    notes: saved.notes || "",
    type: "birthday",
  };
}

/**
 * The add/edit person form with the shared `@person` note mentions. No sheet
 * shell of its own, so it can sit inside any container (the calendar reuses its
 * detail slide-over, swapping this in place — no extra slide animation).
 * `person === null` adds via PUT; otherwise it edits via PATCH.
 */
export function PersonForm(
  { person, groups, personalKey, people, saveUrl, onSaved, onCancel }: Props,
) {
  const editing = Boolean(person);
  const branchKeys = Object.entries(groups)
    .filter(([, group]) => group.kind !== "personal")
    .map(([key]) => key);
  const [draft, setDraft] = useState<PersonDraft>(() => ({
    name: person?.name ?? "",
    born: person?.date ?? "",
    died: person?.died ?? "",
    affiliation: person?.affiliation ?? branchKeys[0] ?? "",
    notes: person?.notes ?? "",
  }));
  const [menu, setMenu] = useState<MentionMenu | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const nameInput = useRef<HTMLInputElement | null>(null);
  const notesInput = useRef<HTMLTextAreaElement | null>(null);

  // --- Affiliation combobox -------------------------------------------------
  // One typeahead over everything a person can be filed under: the family
  // branches, "Mine folk" (the viewer's own list, created server-side on first
  // use), and — when the typed name matches nothing — a create-branch option.
  // `affQuery === null` means closed; the trigger shows the selected label.
  const [affQuery, setAffQuery] = useState<string | null>(null);
  const [affIndex, setAffIndex] = useState(0);
  const affInput = useRef<HTMLInputElement | null>(null);

  const personalValue = personalKey ?? PERSONAL_AFFILIATION;
  const personalLabel = personalKey
    ? groups[personalKey]?.label ?? t("personForm.affiliation.myPeople")
    : t("personForm.affiliation.myPeople");

  const affOptions = useMemo<AffiliationOption[]>(() => {
    const all: AffiliationOption[] = [
      ...branchKeys.map((key) => ({
        value: key,
        label: groups[key].label,
        kind: "branch" as const,
      })),
      { value: personalValue, label: personalLabel, kind: "personal" as const },
    ];
    // Editing someone filed under a shared list keeps that choice available.
    if (
      person?.affiliation && groups[person.affiliation] &&
      !all.some((option) => option.value === person.affiliation)
    ) {
      all.push({
        value: person.affiliation,
        label: groups[person.affiliation].label,
        kind: "personal",
      });
    }
    const query = (affQuery ?? "").trim();
    const lower = query.toLocaleLowerCase("nb");
    const shown = lower
      ? all.filter((option) => option.label.toLocaleLowerCase("nb").includes(lower))
      : all;
    const exact = all.some((option) => option.label.toLocaleLowerCase("nb") === lower);
    if (query && !exact) {
      shown.push({ value: `${NEW_BRANCH_PREFIX}${query}`, label: query, kind: "new" });
    }
    return shown;
  }, [affQuery, groups, personalKey, person?.affiliation]);

  const selectedOption = ((): AffiliationOption => {
    if (draft.affiliation.startsWith(NEW_BRANCH_PREFIX)) {
      return {
        value: draft.affiliation,
        label: draft.affiliation.slice(NEW_BRANCH_PREFIX.length),
        kind: "new",
      };
    }
    if (draft.affiliation === personalValue) {
      return { value: personalValue, label: personalLabel, kind: "personal" };
    }
    const group = groups[draft.affiliation];
    return {
      value: draft.affiliation,
      label: group?.label ?? draft.affiliation,
      kind: group?.kind === "personal" ? "personal" : "branch",
    };
  })();

  function chooseAffiliation(option: AffiliationOption) {
    setDraft((current) => ({ ...current, affiliation: option.value }));
    setAffQuery(null);
  }

  useEffect(() => {
    nameInput.current?.focus();
  }, []);

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
    if (!draft.name.trim()) return setError(t("personForm.error.nameRequired"));
    if (!birthDateValid(draft.born)) {
      return setError(t("personForm.error.bornFormat"));
    }
    if (!deathDateValid(draft.died)) {
      return setError(t("personForm.error.diedFormat"));
    }
    if (!draft.affiliation) return setError(t("personForm.error.groupRequired"));

    setSaving(true);
    setError("");
    const personInput = {
      name: draft.name,
      born: draft.born || null,
      died: draft.died || null,
      affiliation: draft.affiliation,
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
        setError(body.error || t("common.error.saveFailed", { status: response.status }));
        return;
      }
      onSaved(toViewPerson(body.person), body.group ?? undefined);
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
        {t("personForm.name")}
        <input
          ref={nameInput}
          value={draft.name}
          onInput={(event) => setDraft({ ...draft, name: event.currentTarget.value })}
          class="input"
        />
      </label>
      {editing && (
        <label class="grid gap-1.5 text-sm font-medium">
          {t("personForm.id")}
          <input
            value={person!.id}
            readOnly
            class="input bg-inset font-mono text-xs text-ink-2"
          />
        </label>
      )}
      <div class="grid grid-cols-2 gap-3">
        <label class="grid gap-1.5 text-sm font-medium">
          {t("personForm.born")}
          <input
            value={draft.born}
            onInput={(event) => setDraft({ ...draft, born: event.currentTarget.value })}
            placeholder="YYYY-MM-DD / MM-DD"
            class="input min-w-0"
          />
        </label>
        <label class="grid gap-1.5 text-sm font-medium">
          {t("personForm.died")}
          <input
            value={draft.died}
            onInput={(event) => setDraft({ ...draft, died: event.currentTarget.value })}
            placeholder="YYYY-MM-DD"
            class="input min-w-0"
          />
        </label>
      </div>
      <div class="relative grid gap-1.5 text-sm font-medium">
        <label for="person-form-affiliation">{t("personForm.group")}</label>
        <input
          id="person-form-affiliation"
          ref={affInput}
          value={affQuery ?? selectedOption.label}
          placeholder={t("personForm.affiliation.placeholder")}
          role="combobox"
          aria-expanded={affQuery !== null}
          aria-autocomplete="list"
          autocomplete="off"
          class="input"
          onFocus={(event) => {
            setAffQuery("");
            setAffIndex(0);
            event.currentTarget.select();
          }}
          onInput={(event) => {
            setAffQuery(event.currentTarget.value);
            setAffIndex(0);
          }}
          onKeyDown={(event) => {
            if (affQuery === null) return;
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              event.preventDefault();
              const direction = event.key === "ArrowDown" ? 1 : -1;
              if (affOptions.length) {
                setAffIndex(
                  (affIndex + direction + affOptions.length) % affOptions.length,
                );
              }
            } else if (event.key === "Enter") {
              event.preventDefault();
              if (affOptions[affIndex]) chooseAffiliation(affOptions[affIndex]);
              affInput.current?.blur();
            } else if (event.key === "Escape") {
              setAffQuery(null);
              affInput.current?.blur();
            }
          }}
          onBlur={() => setTimeout(() => setAffQuery(null), 120)}
        />
        {affQuery !== null && affOptions.length > 0 && (
          <div class="absolute left-0 right-0 top-full z-20 mt-1 overflow-hidden rounded-lg border border-line bg-surface shadow-pop">
            {affOptions.map((option, index) => (
              <button
                key={option.value}
                type="button"
                class={`flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm ${
                  index === affIndex ? "bg-accent-soft text-accent-2" : "hover:bg-inset"
                }`}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  chooseAffiliation(option);
                  affInput.current?.blur();
                }}
              >
                <span class="font-medium">
                  {option.kind === "new"
                    ? t("personForm.affiliation.create", { label: option.label })
                    : option.label}
                </span>
                {option.kind !== "branch" && (
                  <span class="shrink-0 text-xs text-ink-3">
                    {option.kind === "personal"
                      ? t("personForm.affiliation.tagPersonal")
                      : t("personForm.affiliation.tagNew")}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
        <p class="text-xs font-normal leading-relaxed text-ink-3">
          {selectedOption.kind === "personal"
            ? t("personForm.affiliation.hintPersonal")
            : selectedOption.kind === "new"
            ? t("personForm.affiliation.hintNew")
            : t("personForm.affiliation.hintBranch")}
        </p>
      </div>
      <div class="relative grid gap-1.5 text-sm font-medium">
        <label for="person-form-notes">{t("common.notes")}</label>
        <textarea
          id="person-form-notes"
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
          {saving
            ? t("common.saving")
            : editing
            ? t("personForm.saveChanges")
            : t("personForm.add")}
        </button>
      </div>
    </form>
  );
}
