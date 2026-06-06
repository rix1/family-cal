# Family Calendar

A private calendar for birthdays and other important dates across the family.

The app is a **Fresh 2 / Vite** app on Deno, backed by Deno KV. Fresh serves the
web pages, admin pages, JSON API, and per-viewer iCal subscription feeds.

## Files

| File / directory | Purpose |
| --- | --- |
| `routes/` | Fresh file routes for pages, JSON API, health check, and iCal feeds. |
| `lib/` | Domain logic: store, KV adapter, seed loading, iCal, holidays, validation. |
| `seed/*.csv` | Optional CSV data loaded by the explicit seed command. |
| `test/` | Deno tests for domain logic and Fresh route handlers. |
| `main.ts` | Fresh `App` entry point. |
| `vite.config.ts` | Fresh 2 Vite plugin config. |
| `architecture.md` | Architecture notes. |
| `design.md` | Visual/product design notes. |

## Running

```sh
KV_PATH=/path/to/family-cal.db deno task dev
```

The database starts empty. There are two ways to populate it:

1. Run `KV_PATH=/path/to/family-cal.db deno task seed` to load `seed/*.csv`.
2. Issue an editor link, open the admin, and enter your own groups and people.

The seed command refuses to modify a non-empty database. Use `--force` to clear
people and viewers and replace groups before loading:

```sh
KV_PATH=/path/to/family-cal.db deno task seed --force
```

## Access links

Set `KV_PATH` to the same database used by the app, then issue a cryptographically random
capability:

```sh
KV_PATH=/path/to/famcal.db deno task issue-link \
  --name "Solveig" \
  --groups no \
  --base-url https://family.example
```

The command prints private calendar and iCal URLs. Use `--groups no,dk` for selected
groups, or omit `--groups` for all groups. Add `--edit` to make the viewer an editor
and print an admin URL. On an empty database, create the first editor without
`--groups`, then add groups at `/admin/groups/`.

There is no username/password form. Possession of a private capability URL is the
login. Share these URLs privately and replace a viewer token if it leaks.

## Administration

Open the admin URL printed by `issue-link --edit`. It validates the editor token,
stores it in an HttpOnly session cookie, and redirects to `/admin/`.

- `/admin/people/` edits people in a batch table and exports `people.csv`.
- `/admin/groups/` edits family groups.
- `/admin/viewers/` lists issued capabilities and their permissions.
- `/admin/audit/` shows person changes attributed to editors.

Person details can also be edited directly from the calendar flyout by an editor.
Changes are written to KV and audited under the editor capability's name.

Death dates use full `YYYY-MM-DD` values. Deceased relatives keep their birthday with
“would have turned” wording and also receive a yearly remembrance event on the anniversary of
their death.

## Permissions

Every issued viewer is view-only by default. The stored property is
`Viewer.canEdit`, which defaults to `false`.

Create an editor at issuance time:

```sh
KV_PATH=/path/to/family-cal.db deno task issue-link \
  --name "Family admin" \
  --edit \
  --base-url https://family.example
```

Grant or remove editor access for an existing viewer by updating that property:

```sh
KV_PATH=/path/to/family-cal.db deno task set-permission \
  --token "the-viewer-token" \
  --edit true

KV_PATH=/path/to/family-cal.db deno task set-permission \
  --token "the-viewer-token" \
  --edit false
```

An editor can use the admin pages and person write APIs. A view-only viewer can
only open their scoped calendar and iCal feed.

## Subscribing

In Google, Apple, or Outlook Calendar, choose "Subscribe from URL" and paste the
iCal URL printed by `issue-link`.

## Testing / build

```sh
deno task check
deno fmt --check
deno lint
deno task build
```

Generated Fresh output lives in `_fresh/` and is git-ignored.
