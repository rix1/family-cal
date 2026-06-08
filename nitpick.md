# Nitpick / smaller feedback to be fixed

- [x] consistent (font) styling is not applied to the /about page compared to the main page

## calendar > flyout
- [x] ditch the blur on the backdrop for the flyout.
- [x] ditch opacity tranition on the flyout itself; instead, follow this pattern: container is rendered off screen and we use translateX when clicking. this should make it feel more snappy.
- [x] when editing notes, @mention doesn't work.

# admin
- [x] ensure consistent usage of toasts: people edit has save confirmation, other pages should too.
- [x] add top nav in order to navigate back to the main calendar. also change from "Edit" to "Admin"

## auth
- [x] issuing a new link for the same user does not expire the old one. expired links should say something like "expired - ask for a new oen"
- [x] add 404 and error page templates and ensure consistent usage.
- [x] UX improvement: store token in cookie or localstorage. Means we also need a way to "log out"
- [x] Invite improvement: Add a "new" button to /admin/viewers/ to issue new links (with click to copy)
- [x] for /admin/viewers/ - Add the ability to expire a token and add some filters to the table.
- [ ] Invite links: make it possible to toggle admin on/off when creating an invite link 
- [ ] invite links: change default intervals to: 30m, 4h, 1d, 7d

## other
- [x] add dark mode
- [x] add a persistent theme toggle button

## calendard > filters
- [x] need to fix the filters: make them dropdown checkbox select instead of pills
- [x] deselecting the final filter must not reselect every option
- [x] clicking outside a filter popover closes it

## Nav

- [x] Redesign right part of the navbar: Move most items into a dropdown (keep today), under the viewer name with initials as avatar. and ditch the silly emojis.
- [x] Use the same nav across all pages (/about)
