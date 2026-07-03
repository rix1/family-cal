# Plan: a more educational, welcoming onboarding

## Where onboarding stands today

A new family member's entire journey is: open the invite link → fill in name,
email, and tick group checkboxes (labels only) → land straight on the full
calendar. Everything educational after that is passive and easy to miss:

- Groups are explained in one line on the invite form; nothing says what a
  group *is* or which relatives each one covers.
- The three highest-value actions — follow groups, subscribe to the monthly
  email, add the feed to Google/Apple Calendar — all live on `/profile/`,
  which a newcomer only finds via the "Set up your profile" card in the
  "In focus" column.
- Adding people and custom events is completely undiscovered (menu items with
  no introduction), and only `/about` (FAQ page) explains anything in depth.

## Phase 1 — Invite page that teaches (small)

The invite page is the one moment we have everyone's full attention.

1. **Group descriptions.** Add an optional `description` to the group model
   (KV + the admin groups form) and render it as muted text under each group
   checkbox on the invite page and profile. Example: *"Norwegian side —
   everyone descending from Astrid & Odd"*. This alone answers "what are
   groups?" where the question actually arises.
2. **A two-sentence intro block** above the form: what the calendar is
   (private family calendar for birthdays, remembrances, and celebrations),
   and how access works (no passwords — your personal link is your key).
3. **Reassure on groups**: "Groups decide whose dates you see. Pick the sides
   of the family you care about — you can change this anytime."

## Phase 2 — A short welcome tour after joining (medium)

After signup, redirect to `/view/<token>?welcome=1` and show a one-time,
skippable 3-step sheet (reuse the existing slide-over sheet pattern from the
calendar island — no new UI machinery):

1. **"This is your family calendar"** — what appears on it, and a line showing
   *their* chosen groups with an edit link.
2. **"Take it with you"** — the Add to Google Calendar / Apple Calendar
   buttons, reusing the profile page's feed-URL logic. This is the
   highest-retention action; surface it before they ever have to find
   `/profile/`.
3. **"The monthly email"** — subscribe toggle inline (we already have their
   email), one line about what it is (short Norwegian note, once a month).

Editors get a 4th step: adding people and custom events, and @mentions in
notes. Store completion on the viewer record (`viewer.welcomedAt`) rather than
localStorage — magic-link auth means people hop devices, and KV already holds
per-viewer state (`newsletter`, `groups`).

## Phase 3 — Getting-started checklist on the calendar (small)

Replace the single "Set up your profile" card with a small checklist card that
lives in "In focus" until done or dismissed:

- ✓ Follow your groups (done at signup)
- ☐ Subscribe in your calendar app
- ☐ Get the monthly email

`subscribed` and `followedGroups` are already props of the Calendar island;
"subscribed in calendar app" has no signal today, so either set a flag when a
feed button is clicked on `/profile/`, or let that item be manually
dismissible. Card hides itself once everything is checked (persist dismissal
alongside `welcomedAt`).

## Phase 4 — Help where confusion happens (small)

- Groups filter dropdown footer: prepend one defining sentence ("Groups are
  sides of the family; you see the ones you follow") before the existing
  profile link.
- Extend the `/about` FAQ with: "How do I add a person or event?", "What is
  the monthly email?", "How do I see this in Google/Apple Calendar?" — then
  link "Learn how it all works → /about" from both the invite page and the
  last step of the welcome tour.

## Data-model changes (all additive, no migrations)

| Field | Where | Purpose |
|---|---|---|
| `description?: string` | group | explain each group at signup and on profile |
| `welcomedAt?: string` | viewer | welcome tour shown once, across devices |
| `checklistDismissedAt?: string` | viewer | hide the getting-started card |

## Suggested order

1 (invite copy + group descriptions) → 3 (checklist card) → 2 (welcome tour)
→ 4 (FAQ/inline help). Phases 1 and 3 are each an afternoon and deliver most
of the value; the tour is the only medium-sized piece.
