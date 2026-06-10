# Family Calendar Design Spec

## Product Feel

Professional, warm, and calm. The page should feel like a lightweight family operating system: useful at a glance, personal in the details, and polished enough to share with relatives without explanation.

## Visual Direction

One token-based design system lives in `styles.css` (Tailwind v4 `@theme`); every page —
calendar, admin, invite, about, errors — reads the same semantic tokens, and dark mode only swaps
token values (no per-component overrides anywhere).

Deliberate rules, in priority order:

- **Color is meaning.** Teal accent marks "now and next" only (today, next-up, active states,
  primary actions). Gold is reserved for milestone birthdays. Norway blue / Denmark red appear
  only as holiday country badges. Everything else is the warm neutral ramp
  (`page → inset → surface`, `ink/ink-2/ink-3`).
- **Surfaces, not decoration.** Three background levels: `page` (warm porcelain canvas),
  `surface` (cards), `inset` (quiet rows, fact boxes, hover states). 1px `line` borders and a
  whisper of shadow; real shadows only on popovers and the person sheet.
- **Typography carries hierarchy.** System sans; semibold headings with slightly tight tracking;
  uppercase 11px "kicker" labels for section headings; tabular numerals on every date and count.
- **Emoji are content, not chrome.** Event-type glyphs (🎂 🕯️ 💍, flags) and milestone flare
  stay; all UI iconography (search, chevrons, close, brand) is stroke SVG.
- **One shape scale.** Controls 8px, cards 12px, sheet 16px; pills only for toggles (chips),
  badges, and the account chip.
- Shared component classes: `.btn` (+`-primary/-ghost/-danger/-sm`), `.input`, `.card`, `.chip`,
  `.badge`, `.kicker`, `.menu`, `.data-table`, `.sheet`, `.toast` — calendar and admin draw from
  the same set so the app reads as one product.
- Brand mark: an eight-point "celebration spark" in an accent rounded square, used in the header
  and on access/invite/error pages.

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
- Reusable `/invite/<token>` links expire at a configured time. Each signup creates
  a separate editor viewer using the person's submitted name and selected groups,
  then redirects through the normal viewer login route.
- Per-viewer iCal feeds are served from `/cal/<token>.ics` and subset by the viewer's groups.
- Current person schema: `{ id, name, born, died, groups, notes }`, where `born` is `YYYY-MM-DD`, `MM-DD`, or `null`, and `died` is a full `YYYY-MM-DD` or `null`.
