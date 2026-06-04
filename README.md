# Family Calendar

A family calendar for birthdays and other important dates across the extended family and our Danish family.

Run it via the `server/` Deno app. The server serves the web app, a JSON API, and per-viewer iCal subscription feeds, all backed by Deno KV. New KV stores are bootstrapped from CSV seed files in `server/seed/`.

## Files

| File / directory    | Purpose                                                         |
| ------------------- | --------------------------------------------------------------- |
| `index.html`        | Calendar view, served by the Deno app.                          |
| `edit.html`         | Add / edit people via the API; can also export a CSV backup.    |
| `server/`           | Deno server, Deno KV store, iCal generator, JSON API and tests. |
| `server/seed/*.csv` | CSV seed data for bootstrapping a fresh KV store.               |
| `architecture.md`   | Target architecture and migration notes.                        |
| `design.md`         | Visual/product design notes.                                    |

## Running

```sh
cd server
deno task dev
```

Open `http://localhost:8000/` for the calendar and `http://localhost:8000/edit.html` to edit.

The server seeds an empty KV store from:

- `server/seed/people.csv`
- `server/seed/groups.csv`
- `server/seed/viewers.csv`

Use `KV_PATH=/tmp/famcal.db deno task dev` if you want an explicit local database file.

## Subscribing

Use one of the seeded feed URLs while prototyping:

- `http://localhost:8000/cal/demo-all.ics` — everyone
- `http://localhost:8000/cal/demo-no.ics` — Family
- `http://localhost:8000/cal/demo-dk.ics` — Danish family

In Google/Apple/Outlook Calendar, choose "Subscribe from URL" and paste one of those URLs.

## Editing

Open `/edit.html`, enter your name, edit the table, and click **Save**. Changes are written to KV and audited. **Download CSV** exports a `people.csv` backup that can also be used as seed material later.

## Testing

```sh
cd server
deno task check
deno fmt --check
deno lint
```

## Notes

- `family-dates.js` was removed. KV is now the runtime source of truth; CSV files are only seed/bootstrap material.
- Original raw CSV files at the repo root remain git-ignored historical inputs.
