# Monthly Birthday Newsletter

> **Status:** Implemented (no cron, no email provider — manual BCC sending).

## Summary

Add self-service newsletter preferences for authenticated viewers and an admin
workflow that generates, edits, previews, and manually sends Norwegian monthly
birthday newsletters. No cron or email provider is introduced.

## Data And Interfaces

- Extend `Viewer` with optional `newsletter: { email, groups, subscribedAt, updatedAt }`.
  - Absence means unsubscribed.
  - Empty `groups` means all groups.
  - Expired viewers are excluded.
  - Direct viewer-link rotation preserves the latest newsletter preference.
- Add `NewsletterDraft` containing:
  - An opaque, URL-safe id (UUID). Generation is not deduplicated by
    `(month, segment)` — running it again for the same month adds more
    drafts; delete unwanted ones instead.
  - Target month and canonical group-segment key.
  - Subject, editable Markdown body, anonymous LLM prompt.
  - Audience groups and timestamps.
  - `draft | sent` status, sender, send time, and recipient count.
- Add Store/SeedStore/KvStore methods and a new KV prefix for drafts. Existing
  KV records require no migration.
- Add viewer-authenticated `/newsletter/` and admin-authenticated
  `/admin/newsletters/` routes.

## Subscription Experience

- Add "Monthly email" to the account menu and a compact calendar card linking
  to `/newsletter/`.
- The form uses the viewer's existing name and accepts email plus newsletter
  groups independently of calendar groups.
- Validate and normalize email server-side; reject duplicate email
  subscriptions among active viewers.
- Allow viewers to update preferences or unsubscribe immediately.
- Record subscribe, update, and unsubscribe actions in the audit log.
- Do not add email verification in this version.

## Draft Generation

- Generation is manual only: a month picker on the admin page, allowing the
  current month through twelve months ahead. There is no cron, lead-window
  auto-generation, or admin-configurable settings for it.
- When the current month has subscriber segments with birthdays but no draft
  yet, show an info box naming the missing segment(s) — a nudge, not an
  automatic action.
- Generate one draft per distinct normalized group combination among active
  subscribers. Generating for a month that already has drafts is allowed and
  simply adds more; there is no `(month, segment)` idempotency key. Delete
  drafts you don't want.
- Filter people using the existing "any selected group matches" behavior.
  Avoid duplicate people.
- Skip audience segments with no birthdays.
- Include birthdays chronologically in Norwegian Bokmål:
  - Known year: date, name, and new age.
  - Unknown year: date and name.
  - Deceased relative: respectful "ville ha fylt" wording.
  - Exclude person notes, death anniversaries, holidays, and other family
    events.
- Default subject: `Familiekalenderen: bursdager i <måned> <år>`.
- Add an intro placeholder at the top of the Markdown body.

## LLM Prompt And Editing

- Generate a separate copyable Norwegian prompt containing only:
  - Target month/year.
  - Number of birthdays.
  - Anonymous birthday dates and counts.
  - Instructions for a warm 2–3 sentence introduction without invented facts.
- Never include names, ages, birth years, emails, notes, group labels, or
  other identifying data in the prompt.
- The admin pastes the generated introduction over the Markdown placeholder
  and saves.
- Render saved Markdown using sanitized `@deno/gfm`
  (https://jsr.io/@deno/gfm).
- Provide copy actions for subject, BCC addresses, Markdown, LLM prompt, and
  rich text.
- For rich-text copying, clone the rendered preview and inline its computed
  styles before writing HTML and plain text to the clipboard.

## Draft Lifecycle

- Recipient addresses remain dynamically derived until the draft is marked
  sent.
- Explicit regeneration replaces subject, body, and prompt from current
  birthday data after confirmation, and therefore discards manual edits.
- Sent drafts are immutable and retain their content, audience, send
  timestamp, sender, and recipient count.
- Drafts (and sent records) can be deleted after confirmation. Generation is
  manual and unrestricted, so a deleted month/segment is only recreated if an
  admin generates that month again.
- The admin page lists active subscribers, audience segments, and historical
  drafts.
- Manual delivery uses BCC so recipients cannot see one another's addresses.

## Test Plan

- Unit-test month windows, Oslo timezone boundaries, segment canonicalization,
  group filtering, sorting, ages, unknown years, deceased wording, and empty
  segments.
- Assert that generated LLM prompts contain no subscriber or person PII.
- Test draft idempotency, regeneration, and sent-draft immutability.
- Test viewer subscription authentication, validation, duplicate email
  handling, updates, unsubscribe, expiration, and link-rotation preservation.
- Test admin authorization, settings changes, manual/automatic generation,
  BCC audiences, and mark-sent behavior.
- Run `deno task check`, `deno fmt --check`, `deno lint`, and
  `deno task build`.

## Deferred

- Automatic sending, Resend or another email provider, cron infrastructure,
  delivery tracking, email verification, and personalized unsubscribe links.
