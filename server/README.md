# Family Calendar server

TypeScript on Deno, backed by Deno KV. Implements the
[architecture](../architecture.md): a structured store → generator → per-viewer
iCal feeds, plus a JSON API and the web app served from the same origin.

## Run

```sh
deno task dev      # watch mode on http://localhost:8000
deno task start    # run once
```

Data lives in Deno KV, seeded from `src/seed.ts` on first run. `PORT` overrides
the port (default `8000`); `KV_PATH` overrides the KV location (handy for a
throwaway DB, e.g. `KV_PATH=/tmp/famcal.db`).

### Routes

| Route                  | Purpose                                                     |
| ---------------------- | ----------------------------------------------------------- |
| `GET /`                | The calendar web app (`index.html`).                        |
| `GET /edit.html`       | The editor.                                                 |
| `GET /cal/<token>.ics` | A subscriber's per-viewer iCal feed (their group subset).   |
| `GET /api/data`        | `{ groups, people }` for the web app.                       |
| `POST /api/people`     | Full replace of people (`{ actor, people }`); audited.      |
| `GET /api/audit`       | Recent change history (`?limit=`).                          |
| `GET /health`          | Liveness check.                                             |

Seed tokens for trying feeds: `demo-all` (everyone), `demo-no` (Family),
`demo-dk` (Danish family). Subscribe in a calendar app via "Subscribe from URL"
→ `http://localhost:8000/cal/demo-all.ics`. Apple/Outlook honor the embedded
birthday reminders; Google applies its own per-calendar notification settings.

The web app expects this API. `family-dates.js` has been removed; CSV seed files are only for bootstrapping fresh KV stores.

## Test

```sh
deno task test     # unit + handler tests, fully offline (no remote deps)
deno task check    # type-check + tests
deno fmt && deno lint
```

## Layout

| Path                | Responsibility                                                       |
| ------------------- | ------------------------------------------------------------------- |
| `src/model.ts`      | Domain types (`Person`, `Viewer`, `CalEvent`, `AuditEntry`).        |
| `src/store.ts`      | `Store` interface (the swappable-engine seam) + in-memory `SeedStore`. |
| `src/kv_store.ts`   | `KvStore` — the Deno KV implementation (the deploy target).         |
| `seed/*.csv`        | Seed people, groups and viewer tokens for fresh KV stores.          |
| `src/seed.ts`       | Loads and parses the CSV seed files.                                |
| `src/dates.ts`      | Partial-date parsing + UTC date math.                              |
| `src/holidays.ts`   | NO/DK holidays, computed via Easter (Computus) — no external data. |
| `src/events.ts`     | People + holidays → `CalEvent`s; reminder policy.                  |
| `src/ical.ts`       | RFC 5545 serialization (line folding, escaping, RRULE, VALARM).    |
| `src/people.ts`     | Validation + diff/apply of edits, with audit.                      |
| `src/feed.ts`       | Orchestrates store → events → iCal; per-viewer group subsetting.   |
| `src/handler.ts`    | HTTP routing (pure function over a `Store`, so it's unit-testable). |
| `main.ts`           | Wires `KvStore` + handler into `Deno.serve`.                       |

## Design notes

- **Storage is behind the `Store` seam.** `KvStore` is the real one; `SeedStore`
  is an in-memory twin used in tests and as an offline fallback. Swapping engines
  touches one file.
- **Access = capability token.** `/cal/<token>.ics` both authorizes and
  identifies the viewer; rotating a token revokes exactly one person. A viewer
  with no groups sees everyone.
- **Holidays are computed, never stored** (Easter/Computus), for any year.
- **Birthdays recur (`RRULE:FREQ=YEARLY`)** with age-free titles (one title for
  all years — the web view computes age and "would have turned").
- **Holidays are explicit per-year events**, since Easter-relative dates move.
- **Edits are a full replace with a diff + audit**: `POST /api/people` deletes
  removed, upserts changed/new, and records each change keyed by `actor`.
- **Reminders**: birthdays get one all-day-safe alarm (~09:00 the day before);
  other kinds are quiet by default (`src/events.ts` `reminderDefaults`).
