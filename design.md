# Family Calendar Design Spec

## Product Feel

Professional, warm, and calm. The page should feel like a lightweight family operating system: useful at a glance, personal in the details, and polished enough to share with relatives without explanation.

## Visual Direction

- Palette: warm paper background, charcoal text, teal for birthday energy, amber for milestones, restrained blue/red for NO/DK holiday country signals.
- Shape: compact rounded rectangles with 10-16px radius. Avoid nested-card clutter; use framed cards only for distinct information units.
- Typography: system sans, medium-weight headings, no negative letter spacing, compact but breathable spacing.
- Texture: subtle borders, soft shadows, and a light paper-like page tone instead of generic white/gray panels.

## Interaction

- The page opens at the current month.
- Primary actions live in the sticky header: `Edit`, `Export .ics`, and `Today`.
- `Export .ics` produces a real iCal file (recurring yearly birthdays) honoring the active filters, so it can be imported into Google/Apple Calendar.
- Filters and a search box let viewers narrow by family group, entry type, or name.
- Mobile should remain a single scrollable timeline with summary cards above it.

## Content Rules

- Birthdays lead with the person and age.
- Milestone birthdays get extra emoji flare and a warmer card treatment.
- Public holidays stay quieter than birthdays, with clear NO/DK country chips.
- Missing dates are visible but secondary.

## Architecture

- `family-dates.js` is the single source of truth: `window.FAMILY_DATA = { groups, people, holidays }`. It is loaded via a `<script>` tag so both pages work over http(s) *and* from the local file system (a plain `family-dates.json` + `fetch()` would be blocked under `file://`).
- `index.html` is the read-only calendar view.
- `edit.html` is the editor: it loads the data, lets you change it, and regenerates `family-dates.js` for download. Browser `localStorage` holds an autosaved draft only; the committed file is always the real source of truth.
- Entry schema: `{ name, date, type, group, notes }`, where `date` is `YYYY-MM-DD` (full), `MM-DD` (recurring, year unknown), or `""` (unknown).
