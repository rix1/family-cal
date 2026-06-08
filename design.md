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

- Runtime source of truth is Deno KV, accessed through Fresh routes/API.
- New KV stores are empty. `deno task seed` explicitly loads optional CSV files from `seed/`.
- Private `/view/<token>` links establish an HttpOnly session and redirect to the
  canonical `/calendar/` page; data remains available at `/api/data/<token>`.
- Editors enter through `/admin/?token=<editor-token>` and then use the canonical `/admin/*`
  pages. The people admin saves through `POST /api/people/<editor-token>` and can export
  `people.csv` as a backup/seed artifact.
- Per-viewer iCal feeds are served from `/cal/<token>.ics` and subset by the viewer's groups.
- Current person schema: `{ id, name, born, died, groups, notes }`, where `born` is `YYYY-MM-DD`, `MM-DD`, or `null`, and `died` is a full `YYYY-MM-DD` or `null`.
