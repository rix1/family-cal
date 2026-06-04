# Family Calendar feed server

TypeScript on Deno. Emits an iCalendar feed that calendar apps subscribe to.
This is the first slice of the [architecture](../architecture.md): a structured
store → generator → iCal feed. Per-viewer tokens/subsetting come next; for now
it serves a single all-events feed.

## Run

```sh
deno task dev      # watch mode on http://localhost:8000
deno task start    # run once
```

- `GET /` — landing page with the subscribe URL
- `GET /calendar.ics` — the iCalendar feed
- `GET /health` — liveness check

`PORT` env var overrides the port (default `8000`).

To try it in a calendar app: "Subscribe from URL" →
`http://localhost:8000/calendar.ics` (Apple/Outlook honor the embedded birthday
reminders; Google applies its own per-calendar notification settings).

## Test

```sh
deno task test     # unit + handler tests, fully offline (no remote deps)
deno task check    # type-check + tests
deno fmt && deno lint
```

## Layout

| Path                | Responsibility                                                        |
| ------------------- | --------------------------------------------------------------------- |
| `src/model.ts`      | Domain types (`Person`, `CalEvent`, ...).                             |
| `src/store.ts`      | `Store` interface (the swappable-engine seam) + `SeedStore`.          |
| `src/seed.ts`       | Seed data lifted from the prototype's `family-dates.js`.              |
| `src/dates.ts`      | Partial-date parsing + UTC date math.                                 |
| `src/holidays.ts`   | NO/DK holidays, computed via Easter (Computus) — no external data.    |
| `src/events.ts`     | People + holidays → `CalEvent`s; reminder policy.                     |
| `src/ical.ts`       | RFC 5545 serialization (line folding, escaping, RRULE, VALARM).       |
| `src/feed.ts`       | Orchestrates store → events → iCal; holds the per-viewer group seam.  |
| `src/handler.ts`    | HTTP routing (pure function over a `Store`, so it's unit-testable).   |
| `main.ts`           | Wires `SeedStore` + handler into `Deno.serve`.                        |

## Design notes

- **Holidays are computed, never stored.** `holidays.ts` derives every NO/DK
  holiday (fixed + Easter-relative) for any year. The old hand-maintained holiday
  table is gone.
- **Birthdays are recurring (`RRULE:FREQ=YEARLY`)**; their titles omit age (one
  RRULE event has a single title for all years — the web view computes age and
  "would have turned").
- **Holidays are explicit per-year events**, not recurring, because
  Easter-relative dates move annually.
- **Reminders**: birthdays get one all-day-safe alarm (~09:00 the day before);
  other kinds are quiet by default (`src/events.ts` `reminderDefaults`).
