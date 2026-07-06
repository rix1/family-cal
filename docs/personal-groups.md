# Design: personal groups — "add family members" and "my people"

Status: **designed, not implemented.** Decisions below were made in two working
sessions (2026-06-23 and 2026-07-05) and are written down here so they stop
living only in chat transcripts.

## The need, in two halves

Everyone can already add people and events (since `644e025`), but every person
must belong to one of the admin-defined family branches. What members actually
want to add splits into two different intents:

1. **"Add a family member"** — Solveig adds her uncle and his kids. Genuinely
   useful for others to see and toggle; belongs in a (new or existing) branch
   group. Public by nature.
2. **"My people"** — friends, colleagues, a praktikant. Initially imagined as
   strictly private, but partners are a real audience: Solveig's friends are
   relevant to Halvor. So not private-only — *shareable*.

## Core decision: discoverability, not visibility

The trap we deliberately avoided is a three-level ACL ("private / shared with
partner / public") that you'd have to explain to your aunt.

The key insight: **feeds are already opt-in by group.** `Viewer.groups` is an
explicit follow-list (`empty = none`, no magic), enforced on the calendar,
`/api/data`, and the iCal feed. Nobody is force-fed anything. So the
friends/partner problem is not a visibility problem — it's a *discoverability*
problem. "Shared" doesn't mean "everyone now sees my friends' birthdays"; it
means "this group appears in the group picker so my partner can toggle it on."
Your aunt never toggles it, even though she technically could.

Two levels therefore suffice:

- **Not listed** (default) — only the owner sees or follows the group.
- **Listed** — the group appears in everyone's picker, visually separated from
  the family branches.

If "technically could follow it" ever becomes unacceptable (genuinely
sensitive dates), that's the moment to add per-viewer grants — explicitly
deferred until someone asks.

## Model changes

```ts
export interface GroupInfo {
  key: string;
  label: string;
  color: string;
  description?: string;
  /** "branch" = admin-defined family branch (default); "personal" = viewer-created. */
  kind?: "branch" | "personal";
  /** Owner's profile email (stable across token rotation). Personal groups only. */
  owner?: string;
  /** Personal groups only: shown in everyone's group picker. Default false. */
  listed?: boolean;
}
```

- `kind` absent ⇒ `branch`, so existing records need no migration.
- **Ownership is keyed by `Viewer.email`**, not token — tokens rotate on
  magic-link login. This was the prerequisite that made email required
  (`4e3fdcb`, already shipped).
- `Person.affiliation` is unchanged: a friend is just a Person whose
  affiliation is a personal group key. Calendar filtering, iCal, event
  surfaces all work downstream without modification.
- Personal group keys are generated slugs namespaced by owner (e.g.
  `p-halvor-venner`) to avoid collisions with branch keys and each other.
- `group_colors.ts` has a fixed palette; personal groups all share **one
  reserved neutral style** rather than consuming palette slots — unbounded
  user-created groups must not degrade the branch color coding.

### Audit groundwork (do this first)

`AuditEntry` records only actor/action/targetId. Add `groups: string[]` to new
entries **now-ish**, before any of the rest is built, so history accumulates.
It's needed twice later: filtering the activity list to groups you follow, and
surfacing "Solveig shared her friends-list" — which is exactly the
discoverability moment the whole design turns on. (Without it, activity
filtering needs a join against people that breaks for deleted persons.)

## Self-explanatory UI

Never surface "create a group and configure its visibility" as the mental
model. Surface the two intents; the generic mechanism stays under the hood.

### Adding people: one entry point, two paths

The existing "Legg til person" flow gets an affiliation picker that reads as a
question, not a dropdown of keys:

> **Hvem hører de til?** — a single select with typeahead over everything a
> person can be filed under: the family branches (with descriptions) and
> *Mine folk*, your personal list. Typing a name that matches nothing yields
> a descriptive, clickable create option instead of a dead end.

Rules that keep it self-explanatory:

- **"Mine folk" is not called a group anywhere.** It's "your list" — extra
  birthdays you care about. Most users never need to learn it's a group.
- **First use creates the personal group implicitly** (label "Halvors folk",
  unlisted). No "create group" ceremony, no empty-state configuration.
- **The branch path offers existing *or* new**, each with one line of help
  text stating its consequence:
  - *Eksisterende gren* — "Oppdateres for alle som følger denne grenen."
    (this updates for everyone; you're editing the shared family tree.)
  - *Ny gren* (the typeahead's create option when the typed name matches no
    branch) — "Andre kan følge den nye grenen hvis de vil." (a new branch is
    born listed like any branch — others subscribe if they want; nobody is
    auto-subscribed except the creator.)
  - Taxonomy-sprawl guardrails: the typeahead itself is the near-match
    suggester (typing "Dansk…" surfaces *Danske slekta* before any create
    option); new branches take the next free palette color; the admin groups
    page can rename/merge branches later, so mistakes are repairable, not
    fatal.
- Power users can rename their list or create additional named lists from the
  profile — an advanced path, never the front door.

### The share toggle

On the profile, the personal list section gets one switch:

> **La andre i familien følge denne lista**
> Av (bare du ser den) / På (den dukker opp i gruppevelgeren for alle)

One sentence of consequence next to the control, in plain Norwegian. No
"visibility settings" page.

### The group picker (profile, invite, calendar filter)

`GroupPicker` (shared component) renders two sections when shared personal
lists exist:

- **Familiegrener** — the branches, as today.
- **Delte lister** — "Halvors folk (12 personer)" etc., with the existing
  member-preview expander.

Unlisted personal groups appear only in their owner's picker (under a "Dine
lister" heading), pre-checked — you always follow your own list.

### Calendar

Events and birthdays from personal groups render with the shared neutral
badge style, labeled with the list name. No other calendar changes: the
follow-list already drives everything.

## Onboarding plan

Weave the feature into the existing tour + checklist machinery rather than
building new surfaces (see `docs/onboarding-plan.md` for that system).

1. **Invite page / GroupPicker**: shared lists show up naturally in "Delte
   lister" with their descriptions. The groups hint gains one line: "Grupper
   du følger bestemmer hvilke datoer du ser — familiegrener og lister andre
   har delt."
2. **Welcome tour**: the editing step ("add people and events") gets one added
   sentence + the tour graphic (below): family members go in a branch; friends
   go in your own list that only you see unless you share it. This is the
   moment the two-intent model is taught — one sentence each, no settings
   shown.
3. **Getting-started checklist**: unchanged. Do *not* add "create your list"
   as a checklist item — an empty personal list has no value; the list should
   be born the first time someone actually adds a friend.
4. **First friend added** (the teachable moment): after saving a person into
   "Mine folk" for the first time, show a one-time toast/inline note: "Lagret
   i din liste. Bare du ser den — du kan dele den fra profilen." This replaces
   any upfront explanation of sharing.
5. **Recent activity** (discoverability, later phase): a small "Siste
   endringer" list on the calendar or profile — "Solveig la til 3 personer i
   Danske slekta", "Solveig delte lista *Solveigs folk*" — filtered to groups you
   follow, plus share events for listed groups. Built on the `AuditEntry.groups`
   field from phase 0. This is how a partner *finds out* there is something to
   follow without either of them hunting through settings.

### The tour graphic

One inline SVG (a Preact component, so labels run through `t()` and colors
through CSS variables — theme-aware for free) that teaches both distinctions
in a single glance. Quiet, Vercel/rauno-style: hairline 1px strokes, muted
ink, one accent color, small-caps kicker labels, generous whitespace, a faint
dot-grid backdrop. No decoration that isn't information.

Composition, top to bottom:

- **Row 1 — where people live.** Three cards: two solid-border branch cards
  ("Norsk slekt", "Dansk slekt") holding person chips, and one dashed-border
  card ("Mine folk") with a small lock glyph, holding chips too. A tiny
  caption under the dashed card: "bare deg — til du deler".
- **Row 2 — where dates come from.** From one person chip, a line drops to a
  birthday pill ("Farmor · 80 år"); beside it an event pill ("Bryllupsdag ·
  1998") lines back up to its branch card. Both pills carry a small ↻ badge
  with "hvert år" — teaching that people *carry* their dates and events are
  recurring family milestones, not one-off calendar entries.
- **Row 3 — the calendar strip.** A minimal month strip where the two pills
  land as dots, colored by their group. A "Du følger" checkmark row under the
  branch cards closes the loop: follow the group → its dots appear.

Reuse the same component on `/about` where events vs. people is explained in
prose today.

## Phasing

| Phase | Scope | Size |
|---|---|---|
| 0 | `AuditEntry.groups` on all new audit writes | XS, do immediately |
| 1 | Model (`kind`/`owner`/`listed`), the two-path affiliation picker in add-person — existing branch / new branch (with near-match suggestion) / "Mine folk" — and owner-only (unlisted) lists end-to-end: calendar, feed, profile | M |
| 2 | Share toggle + "Delte lister" section in GroupPicker + first-share/first-friend teachable-moment copy + tour sentence | S |
| 3 | Recent-activity list | M |
| — | Per-viewer grants ("only my partner") | Deferred until someone actually asks |

## Knock-on decisions (made)

- **Newsletter**: personal groups participate only in the *follower's own*
  digest content (they follow the list, their digest includes it). They are
  never an admin send-segment. Segment keys already derive from
  `viewer.groups`, so this mostly falls out — verify `subscriberSegments`
  handles unknown-to-admin group keys cleanly.
- **`empty = none`** follow-list semantics stay exactly as shipped; personal
  groups are just more keys. (Historical note: the old "empty = everyone"
  magic would have silently subscribed all-groups viewers to every shared
  friends-list — one of the reasons it was removed.)
- **Admin groups page** shows personal groups read-only (owner, listed,
  member count) so admins can see the taxonomy but don't manage other
  people's lists. Admin deletion = support escape hatch only.

## Resolved questions (2026-07-06)

1. **Owner lifecycle**: personal groups and their people **survive** when the
   owner's viewer records are expired or deleted (data loss is worse than
   orphaned data). An admin can reassign `owner` by editing the record later.
2. **Events in personal groups**: **out of v1 — personal lists are
   people-only.** The event form never offers personal groups. Rationale:
   events here are recurring reminders / historic records of important family
   dates (anniversaries resurface every year, indefinitely), not a generic
   calendar-event feature — a "friends dinner" doesn't belong. Side-finding:
   this distinction wasn't self-evident even while designing, so it won't be
   for family members either — clarify what "events" means in the event form
   UI, the welcome tour, and `/about` (tracked in `nitpick.md`). Revisit
   personal-group events only if a real recurring-date need appears.
3. **Deleting a non-empty list**: blocked — move or remove its people first.
4. **One list or many**: the affiliation control is a select-with-typeahead,
   which resolves this without a decision: it defaults to the single "Mine
   folk" list, and typing an unmatched name renders a descriptive, clickable
   create option. Multiple personal lists (and new branches) slot into that
   same control later without UI rework.
