import { activeMention, insertMention, type MentionMatch } from "@/lib/mentions.ts";
import { useRef, useState } from "preact/hooks";

interface MentionPerson {
  id: string;
  name: string;
}

interface Props {
  /** Form field name the textarea submits as. */
  name: string;
  people: MentionPerson[];
  initialValue?: string;
  rows?: number;
  placeholder?: string;
}

interface Menu {
  match: MentionMatch;
  activeIndex: number;
}

/** Plain-form textarea with the shared `@person` mention autocomplete. */
export function MentionTextarea({
  name,
  people,
  initialValue = "",
  rows = 3,
  placeholder = "Optional; type @ to link a person",
}: Props) {
  const [value, setValue] = useState(initialValue);
  const [menu, setMenu] = useState<Menu | null>(null);
  const input = useRef<HTMLTextAreaElement | null>(null);

  function updateMenu(textarea: HTMLTextAreaElement) {
    const match = activeMention(textarea.value, textarea.selectionStart ?? textarea.value.length);
    setMenu(match ? { match, activeIndex: 0 } : null);
  }

  function suggestions(current: Menu) {
    return people
      .filter((person) => {
        const query = current.match.query;
        return person.id.toLowerCase().includes(query) ||
          person.name.toLowerCase().includes(query);
      })
      .slice(0, 6);
  }

  function choose(person: MentionPerson) {
    if (!menu) return;
    const result = insertMention(value, menu.match, person.id);
    setValue(result.text);
    setMenu(null);
    requestAnimationFrame(() => {
      input.current?.focus();
      input.current?.setSelectionRange(result.cursor, result.cursor);
    });
  }

  const open = menu ? suggestions(menu) : [];

  return (
    <div class="relative grid">
      <textarea
        ref={input}
        name={name}
        value={value}
        rows={rows}
        placeholder={placeholder}
        class="input resize-y"
        onInput={(event) => {
          setValue(event.currentTarget.value);
          updateMenu(event.currentTarget);
        }}
        onClick={(event) => updateMenu(event.currentTarget)}
        onKeyDown={(event) => {
          if (!menu || !open.length) return;
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            const direction = event.key === "ArrowDown" ? 1 : -1;
            setMenu({
              ...menu,
              activeIndex: (menu.activeIndex + direction + open.length) % open.length,
            });
          } else if (event.key === "Enter") {
            event.preventDefault();
            choose(open[menu.activeIndex]);
          } else if (event.key === "Escape") {
            setMenu(null);
          }
        }}
        onBlur={() => setTimeout(() => setMenu(null), 120)}
      />
      {open.length > 0 && (
        <div class="absolute left-0 right-0 top-full z-20 mt-1 overflow-hidden rounded-lg border border-line bg-surface shadow-pop">
          {open.map((person, index) => (
            <button
              key={person.id}
              type="button"
              class={`flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm ${
                index === menu!.activeIndex ? "bg-accent-soft text-accent-2" : "hover:bg-inset"
              }`}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => choose(person)}
            >
              <span class="font-medium">{person.name}</span>
              <span class="font-mono text-xs text-ink-3">@{person.id}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
