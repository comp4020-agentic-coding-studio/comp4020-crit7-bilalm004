# Study-room finder for ANU libraries

A shared study-space finder for the Menzies, Hancock, Chifley and Law libraries
(81 spaces, all bookable 24/7). Book a one-hour slot; a booker can offer spare
seats on a shareable booking and others can join. The problem it targets: a room
booked for four is often used by one, and nobody else can tell or ask.

**Status (work in progress):** Tier 1 is built. You can browse real availability,
book a one-hour slot and cancel it. Bookings are checked on the server (clashes,
daily limits, the 14-day window, no past bookings), stored in SQLite and survive
reloads. Other people's changes appear live over server-sent events. Sharing a
booking, joining, privacy and the inbox are not built yet, so the inbox is empty.

Login is a **fake demo login** (`u1000001`-`u1000005`, password equals the
username). It is not ANU sign-in.

## What good looks like here

- **Honest about ANU rules.** Rooms and capacities come only from
  `docs/FACTSHEET.md`. Every booking is one hour on the hour; limits are per
  person per Canberra day (rooms, the Deck and booths share a pool of 2; desks 3).
  They live in one table (`src/lib/rules.ts`).
- **Honest about sharing.** Shared seats carry a static "seats aren't
  guaranteed" note. There are no timers or auto-release.
- **Private by default.** A booker's name is hidden unless they choose to show it.
- **Calm, accessible UI.** One "Find a space" page with a List and Timetable view,
  checked at 390x844 and 1280x800, light and dark, with status never shown by
  colour alone.

Enforced by `spec/` and `CLAUDE.md`: route and accessibility invariants. Judgement
calls: the visual design and the shared-pool assumption for booths.

## Demo assumptions

- Booths share the room pool of 2 per day (only study rooms and the Deck were
  stated explicitly).
- The accessibility computer and microfilm scanner follow the general 2-per-day rule.

## Cut

Email and push, real SSO, maps, recurring bookings, admin tools, timers and
auto-release of unclaimed seats.
