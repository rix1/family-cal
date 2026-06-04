# Family Calendar

A tiny, no-backend calendar for keeping track of birthdays (and other dates)
across the extended family and our Danish family.

## Files

| File              | Purpose                                                              |
| ----------------- | -------------------------------------------------------------------- |
| `index.html`      | The calendar view everyone opens. Read-only.                         |
| `edit.html`       | Add / edit people and download an updated data file.                 |
| `family-dates.js` | The data — a single source of truth shared by both pages.            |
| `design.md`       | Design notes and architecture.                                       |
| `*.csv`           | Original source data (git-ignored; superseded by `family-dates.js`). |

## Viewing

Open `index.html` — by double-clicking the file, or via a static host. It shows
today, the next upcoming birthday, recent birthdays, missing dates, and a
month-by-month timeline. Use the chips to filter by family or entry type, the
search box to find a person, and **Export .ics** to import birthdays into Google
or Apple Calendar.

## Adding or changing dates

1. Open `edit.html`.
2. Add a row (or edit an existing one). `Date` accepts:
   - `1990-05-17` — full date (shows age),
   - `05-17` — month/day only, when the year is unknown,
   - blank — unknown; the person shows under "Missing dates".
3. Click **Download family-dates.js**.
4. Replace the existing `family-dates.js` with the downloaded file and commit it
   (or just drop it next to the HTML files for local use).

Your edits are auto-saved as a draft in your browser until you download, so you
won't lose work on a refresh. The committed `family-dates.js` is always the
real, shared source of truth — the draft is per-device.

## Deploying

It's fully static. Any of these work:

- **GitHub Pages:** push the repo and enable Pages on the default branch. The
  site serves from `index.html` automatically.
- **Netlify / any static host:** drag the folder in, no build step.
- **Local:** just open `index.html`.

> Note: `index.html` and `edit.html` load Tailwind from a CDN for styling, so an
> internet connection is needed for the layout to look right. The data itself is
> local.
