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

## other
- [x] add dark mode

## calendard > filters
- [x] need to fix the filters: make them dropdown checkbox select instead of pills
