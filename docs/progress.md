# Progress / handoff notes

_Last updated: 2026-06-05_

## Current state

This repo is now a **Fresh 2 / Vite** app on Deno with Deno KV as runtime storage.

Latest commit at handoff:

```text
f2a4fe9 Add person detail fly-out with linked notes
```

Important prior commits:

```text
dff4909 Refine timeline controls and birthday progress card
699be3e Migrate about page to zero-JS Fresh route
7bb7002 Migrate editor page to Fresh island
3dc4755 Migrate calendar page to Fresh island
8595b95 Remove family-dates.js and seed KV from CSV
```

## Structure

```text
routes/              Fresh file routes
  index.tsx          Calendar page, server-loads data, renders Calendar island
  edit.html.tsx      Editor page, server-loads data, renders Editor island
  about.tsx          Zero-JS documentation/about page
  api/data.ts        JSON view data for web app
  api/people.ts      Full-replace people write API + audit
  api/audit.ts       Recent audit entries
  cal/[token].ics.ts Per-viewer iCal feeds
  health.ts          Health check

islands/
  Calendar.tsx       Calendar interactivity
  Editor.tsx         Editor interactivity

lib/
  store.ts           Store interface + in-memory SeedStore
  kv_store.ts        Deno KV implementation
  seed.ts            CSV seed loader
  view_data.ts       Maps KV model to UI view shape
  feed.ts/events.ts  iCal event generation
  ical.ts            RFC5545 serializer
  holidays.ts        NO/DK holiday calculation via Computus
  people.ts          Person validation + full-replace diff/audit
  db.ts              Process-global Store singleton

seed/
  people.csv         People bootstrap data
  groups.csv         Group bootstrap data
  viewers.csv        Viewer/feed tokens bootstrap data
```

`family-dates.js` has been removed. KV is the runtime source of truth; CSVs are only bootstrap/backup material.

## Implemented UX/features

### Calendar

- Fresh page + `Calendar` island.
- Loads from KV server-side via `calendarViewData()`.
- Shows summary cards, upcoming birthdays, recent birthdays, missing dates, filters, search, timeline.
- Starts at current month/today; historic months are not shown initially.
- Downward scroll auto-extends future month window.
- There is a manual **Load past events** button that prepends past months in batches.
  - It preserves the current visual position using document height delta.
  - Scroll correction is immediate/non-smooth.
- Today button scrolls to the exact `#day-YYYY-MM-DD` row.
- The old scroll snapping experiment was reverted; no `snap-*` classes remain.
- “Birthdays this year” card replaced raw `14/39` style with clearer progress UI:
  - celebrated count / total
  - percent chip
  - progress bar
  - remaining count copy

### Person fly-out

- Birthday names are clickable in summary cards and event cards.
- Missing-date person chips are clickable.
- Clicking opens a right-side person detail fly-out showing:
  - name
  - group/family
  - born date
  - age this year
  - next birthday + relative label
  - notes
- Opening a person scrolls the timeline to that person’s next visible birthday entry.
- Notes can include wiki-style links like `[[Solveig]]`; clicking those opens the linked person.
- Lookup supports exact names, ids, and slash aliases like `Åse / Mamma`.
- Seed data now has a test note:
  - `Emil`: `sønnen til [[Solveig]] og [[Halvor]]`

### Editor

- Fresh page + `Editor` island.
- Editable people table.
- Saves via `POST /api/people`.
- Local draft in `localStorage`.
- Actor/name is stored and sent for audit attribution.
- CSV copy/download backup.
- Date validation.

### About

- Fresh zero-JS page (`routes/about.tsx`).
- Documents pages/features, API routes, data model, `[[Name]]` note links, prototype caveats.

### iCal feeds

- `/cal/<token>.ics` per-viewer feeds.
- Seed tokens:
  - `demo-all`
  - `demo-no`
  - `demo-dk`
- Birthdays recurring yearly.
- Holidays computed via Computus, not stored.
- Birthday reminders in iCal remain as previously implemented.

## Validation status

After the latest feature, all passed:

```sh
deno fmt --check
deno lint
deno check main.ts
deno test --allow-net --allow-env --allow-read --allow-write
deno task build
```

Also smoke-tested:

- calendar renders
- editor renders
- about page zero-JS
- Emil linked note comes through `/api/data`
- rendered birthday event targets exist for fly-out scrolling

## Zed setup

Added:

```text
.zed/settings.json
```

This enables Deno LSP and disables the regular TypeScript servers for JS/TS/TSX so go-to-definition works with:

- `@/` import-map aliases
- `jsr:` packages
- Deno KV globals
- Fresh types

If Zed still misbehaves, restart language servers / reload window and ensure the Deno extension is installed.

## Important product/design decisions

- Structured store + per-viewer iCal feeds is locked architecture.
- Deno KV is accepted storage default.
- Calendar apps are distribution targets, not source of truth.
- `seed/*.csv` is bootstrap/backups only.
- Current privacy model is incomplete:
  - iCal feed tokens exist
  - web app/API reads and writes are not yet gated

## Recommended next slices

1. **Refine the person fly-out UX**
   - visual polish
   - backdrop / close-on-escape / close-on-outside-click
   - maybe make it responsive as bottom sheet on mobile
   - check whether auto-scroll-to-next-birthday is desirable or too surprising

2. **Security/read/write gating**
   - require viewer token for calendar/data
   - require editor token for `/edit.html` and `POST /api/people`
   - likely routes: `/view/:token`, `/edit/:token`, existing `/cal/:token.ics`
   - add `canEdit` to `Viewer`

3. **Data model cleanup**
   - remove fake editor `type` dropdown unless events are implemented
   - or introduce first-class `Event` model:
     - `kind`, `date`, `subjectIds`, `recurring`, `notes`
   - support death/would-have-turned properly beyond just display copy

4. **Token/viewer management**
   - issuance/rotation UX
   - viewer group selection
   - admin/editor token handling

5. **Styling cleanup**
   - Tailwind CDN is still used in routes.
   - Could switch to Tailwind Vite plugin or plain CSS assets.

## Known caveats / rough edges

- Person fly-out is new and needs UX testing.
- Calendar `Calendar.tsx` is large; could be split into smaller components/helpers.
- Editor `Editor.tsx` is large; same refactor opportunity.
- Read/write APIs are open until token gating lands.
- About uses inline CSS in route; acceptable for zero-JS but could move to shared CSS later.
- Google Calendar external feed refresh is slow and reminders behavior differs from Apple/Outlook.
