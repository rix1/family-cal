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

`.env` is gitignored; keep real secrets out of the repo. `ENVIRONMENT` is
required; everything else is optional (without the email keys, mail logs to the
console instead of sending). See `.env.template` for the full annotated list;
the ones you'll most likely set:

| Variable | Purpose |
| --- | --- |
| `ENVIRONMENT` | `DEV` or `PROD`. Picks the database (`.data/dev.sqlite3` vs `.data/kv.sqlite3`) and the cookie policy (DEV allows non-Secure cookies for http). |
| `BASE_URL` | Public origin for emailed links and iCal feed URLs. |
| `KV_PATH` | Maintenance-only override of the DB path (e.g. booting a backup copy). |
| `RESEND_API_KEY`, `RESEND_FROM` | Send real email via Resend; otherwise mail logs to the console. |
| `OLLAMA_HOST`, `INTRO_MODEL`, `OLLAMA_KEEP_ALIVE` | Local newsletter-prose model (built-in defaults work as-is). |
| `INTRO_DISABLED`, `INTRO_CMD` | Turn prose off, or shell out to a different local model command. |

Values already present in the real environment take precedence over `.env`, so
deploys can inject secrets without a file. See `DEPLOY.md` for the production setup.

## Running

```sh
deno task dev
```

The dev server always runs on the local dev database `.data/dev.sqlite3` and
refuses to start if it doesn't exist. Two ways to create one:

1. `deno task subset` — copy the production database (`.data/kv.sqlite3`).
2. `ENVIRONMENT=DEV deno task seed` — a fresh database from `seed/*.csv`; then
   issue an admin link and enter your own groups and people.

The seed command refuses to modify a non-empty database. Use `--force` to clear
people, viewers, and invites and replace groups before loading:

```sh
ENVIRONMENT=DEV deno task seed --force
```

## Access links

`issue-link` targets the **dev** database by default (issuing links is usually a
testing action) and prints `http://localhost:3000` URLs; pass `--prod` to write
to production and use `BASE_URL`. Other CLI tasks follow `ENVIRONMENT` from
`.env` (PROD in this working tree) unless overridden inline. Issue a
cryptographically random capability:

```sh
deno task issue-link \
  --name "Solveig" \
  --email solveig@example.com \
  --groups no \
  --prod
```

The command prints private calendar and iCal URLs. `--email` is required — it is the
viewer's magic-link login identity. Use `--groups no,dk` for the groups the viewer
follows; omitting `--groups` means they follow nothing until they pick groups on
their profile. Add `--admin` to make the viewer an administrator and print an admin
URL. On an empty database, create the first admin without `--groups`, then add
groups at `/admin/groups/`.

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

Everyone who joins through an invite can add and edit people and events. Invites
only grant administrator access when an admin explicitly checks that option while
creating them. Each person receives an independent capability, while the invite
itself can be reused by multiple family members until its expiry.

## Administration

Open the admin URL printed by `issue-link --admin`. It validates the admin token,
stores it in an HttpOnly session cookie, and redirects to `/admin/`.

- `/admin/people/` edits people in a batch table and exports `people.csv`.
- `/admin/groups/` edits family groups.
- `/admin/viewers/` lists issued capabilities and their permissions.
- `/admin/invites/` creates and lists expiring family signup links.
- `/admin/audit/` shows changes attributed to the member who made them.

Any member can add people and events, and edit person details, directly from the
calendar flyout. Changes are written to KV and audited under the member's name.

Death dates use full `YYYY-MM-DD` values. Deceased relatives keep their birthday with
“would have turned” wording and also receive a yearly remembrance event on the anniversary of
their death.

## Permissions

Every active viewer can add and edit people and events. The stored property is
`Viewer.isAdmin`, which defaults to `false`: admins can additionally manage
viewers and invites, delete events, send the newsletter, and read the audit log.
Family invites only grant admin access when explicitly selected at creation.

Create an admin at issuance time (in the dev database unless `--prod`):

```sh
deno task issue-link \
  --name "Family admin" \
  --admin \
  --prod
```

Grant or remove admin access for an existing viewer by updating that property:

```sh
deno task set-permission \
  --token "the-viewer-token" \
  --admin true

deno task set-permission \
  --token "the-viewer-token" \
  --admin false
```

An admin can use the admin pages and the bulk-replace people API. Every viewer can
open their scoped calendar and iCal feed and add or edit people and events.

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

Generated Fresh output lives in `_fresh/` (scratch builds) and `_prod/` (what
production serves; written only by `deno task deploy`) — both git-ignored.
