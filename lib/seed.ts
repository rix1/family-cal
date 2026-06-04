import type { GroupInfo, Person, Viewer } from "./model.ts";

/**
 * CSV-backed seed data.
 *
 * KV is the real source of truth at runtime. These files are only used to
 * initialize a fresh KV database (and by tests/in-memory stores). Keeping seed
 * data in CSV makes it easy to inspect, diff, and bulk-edit outside the app.
 */

const seedRoot = `${Deno.cwd()}/seed/`;

function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        quoted = false;
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (ch !== "\r") {
      field += ch;
    }
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }

  const [header, ...body] = rows.filter((r) => r.some((v) => v !== ""));
  if (!header) return [];
  return body.map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ""])));
}

function readSeedCsv(name: string): Record<string, string>[] {
  return parseCsv(Deno.readTextFileSync(`${seedRoot}${name}`));
}

export const SEED_GROUPS: GroupInfo[] = readSeedCsv("groups.csv").map(
  (row) => ({
    key: row.key,
    label: row.label,
    flag: row.flag,
  }),
);

export const SEED_PEOPLE: Person[] = readSeedCsv("people.csv").map((row) => ({
  id: row.id,
  name: row.name,
  born: row.born || null,
  died: row.died || null,
  groups: row.groups ? row.groups.split("|").filter(Boolean) : [],
  notes: row.notes || "",
}));

export const SEED_VIEWERS: Viewer[] = readSeedCsv("viewers.csv").map((row) => ({
  token: row.token,
  name: row.name,
  groups: row.groups ? row.groups.split("|").filter(Boolean) : [],
}));
