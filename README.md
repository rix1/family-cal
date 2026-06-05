# Family Calendar

A family calendar for birthdays and other important dates across the extended family and our Danish family.

The app is now a **Fresh 2 / Vite** app on Deno, backed by Deno KV. Fresh serves the web pages, JSON API, and per-viewer iCal subscription feeds from one root project. Fresh KV stores are bootstrapped from CSV seed files in `seed/`.

## Files

| File / directory | Purpose |
| --- | --- |
| `routes/` | Fresh file routes for pages, JSON API, health check, and iCal feeds. |
| `lib/` | Domain logic: store, KV adapter, seed loading, iCal, holidays, validation. |
| `seed/*.csv` | CSV seed data for bootstrapping a fresh KV store. |
| `test/` | Deno tests for domain logic and Fresh route handlers. |
| `main.ts` | Fresh `App` entry point. |
| `vite.config.ts` | Fresh 2 Vite plugin config. |
| `architecture.md` | Architecture notes. |
| `design.md` | Visual/product design notes. |

## Running

```sh
deno task dev
```

Open `http://localhost:8000/view/demo-all` for the full demo calendar and
`http://localhost:8000/edit/demo-edit` to edit.

The server seeds an empty KV store from:

- `seed/people.csv`
- `seed/groups.csv`
- `seed/viewers.csv`

Use `KV_PATH=/tmp/famcal.db deno task dev` if you want an explicit local database file.

## Subscribing

Use one of the seeded feed URLs while prototyping:

- `http://localhost:8000/cal/demo-all.ics` — everyone
- `http://localhost:8000/cal/demo-no.ics` — Family
- `http://localhost:8000/cal/demo-dk.ics` — Danish family

In Google/Apple/Outlook Calendar, choose "Subscribe from URL" and paste one of those URLs.

## Editing

Open `/edit/demo-edit`, edit the table, and click **Save**. Changes are written to KV and audited
under the editor capability's name. **Download CSV** exports a `people.csv` backup that can also be
used as seed material later.

## Testing / build

```sh
deno task check
deno fmt --check
deno lint
deno task build
```

## Notes

- `family-dates.js` was removed. KV is now the runtime source of truth; CSV files are only seed/bootstrap material.
- Calendar, editor, and about are now Fresh routes. Calendar/editor hydrate islands; About remains zero-JS.
- Generated Fresh output lives in `_fresh/` and is git-ignored.
- Original raw CSV files at the repo root remain git-ignored historical inputs.
