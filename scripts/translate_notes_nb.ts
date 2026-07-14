/**
 * One-off migration: translate the structured English person notes
 * ("Son of @x and @y") into Norwegian («Sønnen til @x og @y»).
 *
 * Dry-run by default — prints every change plus everything it left alone, so
 * the whole result can be reviewed before writing. Pass --apply to write;
 * ENVIRONMENT picks the database, as in every script. Each write goes through
 * updatePerson, so the audit log records the old-note history as usual.
 */
import { getStore, resolveKvPath } from "@/lib/db.ts";
import { updatePerson } from "@/lib/people.ts";

const RELATIONS: Record<string, string> = {
  son: "sønnen til",
  daughter: "datteren til",
  husband: "mannen til",
  wife: "kona til",
  sister: "søsteren til",
  brother: "broren til",
  mother: "moren til",
  father: "faren til",
  boyfriend: "kjæresten til",
  girlfriend: "kjæresten til",
  partner: "partneren til",
};

/** Norwegian for one note, or null when no rule matches (leave it alone). */
export function translateNotes(notes: string): string | null {
  const relation = notes.match(/^(\w+) of (.+)$/i);
  if (relation && RELATIONS[relation[1].toLowerCase()]) {
    const norwegian = RELATIONS[relation[1].toLowerCase()];
    // Mirror the source's capitalization; also mend "and" and bare "@x @y"
    // mention runs in the tail, which only ever lists people.
    const prefix = /^[A-Z]/.test(notes)
      ? norwegian.charAt(0).toUpperCase() + norwegian.slice(1)
      : norwegian;
    const tail = relation[2]
      .replaceAll(" and ", " og ")
      .replace(/(@[a-z0-9-]+) +(?=@)/gi, "$1 og ");
    return `${prefix} ${tail}`;
  }
  const possessive = notes.match(/^(@[a-z0-9-]+)['’]s partner$/i);
  if (possessive) return `Partneren til ${possessive[1]}`;
  return null;
}

if (import.meta.main) {
  const apply = Deno.args.includes("--apply");
  console.log(
    `Database: ${await resolveKvPath()}${apply ? "" : "  (dry-run — pass --apply to write)"}\n`,
  );
  const store = await getStore();
  let changed = 0;
  const untouched: string[] = [];
  for (const person of await store.listPeople()) {
    if (!person.notes) continue;
    const next = translateNotes(person.notes);
    if (next === null) {
      untouched.push(`  ${person.id}: "${person.notes}"`);
      continue;
    }
    if (next === person.notes) continue;
    changed++;
    console.log(`${person.id}:\n  - ${person.notes}\n  + ${next}`);
    if (apply) {
      await updatePerson(
        store,
        person.id,
        { ...person, notes: next },
        "Migrering: notater → norsk",
      );
    }
  }
  console.log(`\n${changed} note(s) ${apply ? "updated" : "would change"}.`);
  console.log(`Left alone (no rule matched):`);
  for (const line of untouched) console.log(line);
}
