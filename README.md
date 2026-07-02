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

## Configuration

Configuration comes from environment variables. Copy the template and edit as
needed — every `deno task` loads `.env` automatically (via Deno's `--env-file`):

```sh
cp .env.template .env
```

`.env` is gitignored; keep real secrets out of the repo. All variables are
optional — with an empty `.env` the app uses a local KV file and logs emails to
the console instead of sending. See `.env.template` for the full annotated list;
the ones you'll most likely set:

| Variable | Purpose |
| --- | --- |
| `BASE_URL` | Public origin for emailed links and iCal feed URLs. |
| `KV_PATH` | Deno KV database path (default `./.data/kv.sqlite3`). Must match app and CLI tasks. |
| `DEV_INSECURE_COOKIES` | Local dev only: allow non-Secure cookies over http (the `dev` task sets this). |
| `RESEND_API_KEY`, `RESEND_FROM` | Send real email via Resend; otherwise mail logs to the console. |
| `OLLAMA_HOST`, `INTRO_MODEL`, `OLLAMA_KEEP_ALIVE` | Local newsletter-prose model (built-in defaults work as-is). |
| `INTRO_DISABLED`, `INTRO_CMD` | Turn prose off, or shell out to a different local model command. |

Values already present in the real environment take precedence over `.env`, so
deploys can inject secrets without a file. See `DEPLOY.md` for the production setup.

## Running

```sh
deno task dev
```

Set `KV_PATH` in `.env` (or inline, e.g. `KV_PATH=/path/to/family-cal.db deno task dev`).
The database starts empty. There are two ways to populate it:

1. Run `KV_PATH=/path/to/family-cal.db deno task seed` to load `seed/*.csv`.
2. Issue an editor link, open the admin, and enter your own groups and people.

The seed command refuses to modify a non-empty database. Use `--force` to clear
people, viewers, and invites and replace groups before loading:

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

There is no username/password form. Opening a private capability URL stores the
token in an HttpOnly cookie and redirects to the clean `/calendar/` URL. The
session lasts for up to one year; **Log out** clears both calendar and admin
sessions. Share capability URLs privately and replace a viewer token if it leaks.
Issuing a new link with the same viewer name expires that viewer's previous active
link.

## Family invites

Editors can create reusable, expiring signup links at `/admin/invites/`. Choose a
30-minute, 4-hour, 1-day, or 7-day expiry, optionally cap how many people may join
(a signup limit), decide whether signups receive administrator access
(**view-only by default** — only grant admin deliberately), and share the
generated URL privately. The invite stops working once it expires or its signup
limit is reached. Until then, each person who opens it:

1. Enters their name.
2. Selects the family groups that apply to them.
3. Receives a new private viewer link and is signed in automatically.

Viewer links created through family invites inherit the invite's selected
permission; invites are view-only unless an editor explicitly grants administrator
access when creating them. Each person receives an independent capability, while
the invite itself can be reused by multiple family members until its expiry.

## Administration

Open the admin URL printed by `issue-link --edit`. It validates the editor token,
stores it in an HttpOnly session cookie, and redirects to `/admin/`.

- `/admin/people/` edits people in a batch table and exports `people.csv`.
- `/admin/groups/` edits family groups.
- `/admin/viewers/` lists issued capabilities and their permissions.
- `/admin/invites/` creates and lists expiring family signup links.
- `/admin/audit/` shows person changes attributed to editors.

Person details can also be edited directly from the calendar flyout by an editor.
Changes are written to KV and audited under the editor capability's name.

Death dates use full `YYYY-MM-DD` values. Deceased relatives keep their birthday with
“would have turned” wording and also receive a yearly remembrance event on the anniversary of
their death.

## Permissions

Viewer links issued directly are view-only by default. The stored property is
`Viewer.canEdit`, which defaults to `false` for direct issuance. Family invites
are also view-only unless the editor explicitly grants administrator access when
creating the invite.

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
