# Nitpick / smaller feedback to be fixed

- [x] in the "Anniversary of their death" please add "(...) i 20XX, YY years ago" so we can easily see how many years ago it is they passed.
- [x] the 404 page links back to "familiekalenderen" - change the link text to "gå til innlogging"


## Viewer admin

- [x] update table with the newly added fields, and add a createdAt property. doesn't have to be one col per field (can combine email + name for instance).
      _(Name+email combined in one column, Created column added, table sorts newest first, search matches email too. `createdAt` is set by `createViewer`; older records show “—”.)_


## Viewer onbording

- [x] If I'm not mistaken, there's no onboarding for viewers? is it possible to re-use the same onboarding flow as invites? Since email and name and admin are required fields, I guess we have to set these at create-time, but on first time visit I'd like them to go through the flow (only name+email fields being disabled) and choose groups, see onboarding etc.
      _(Confirmed — the tour only fired on `?welcome=1` from invite redemption. Now it shows on any first visit until finished/skipped, so admin-issued viewers get the same tour. Group choice inside the tour is still a link to the profile, not an embedded picker — embedding the GroupPicker as a tour step is a possible follow-up.)_

## Onboarding flow

- [x] Selecting groups doesn't let you preview the members like we have on profile. reuse the same component.
      _(Extracted `components/GroupPicker.tsx` from the profile markup; invite page and profile now share it, member preview included. Note: this shows family member names to anyone holding an unauthenticated invite link — deemed acceptable since the link holder can join and see everything anyway.)_
- [x] maybe we could add a menu item for "show onbaording wizard"? or will this cause trouble with the welcomedAt property?
      _(No trouble: `?welcome=1` now force-shows the tour regardless of `welcomedAt`, and the calendar account menu has a "Vis omvisningen" item linking there. Finishing just re-stamps `welcomedAt`, which is idempotent.)_

## Concept clarity

- [ ] Clarify what "events" are (recurring reminders / historic records of important family dates — anniversaries that resurface every year, not generic one-off calendar entries) in the event form UI, the welcome tour, and /about. Surfaced while designing personal groups (see docs/personal-groups.md, resolved question 2) — the distinction wasn't self-evident even mid-design, so it won't be for family members either.
