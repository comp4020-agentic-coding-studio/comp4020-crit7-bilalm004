# Plan: shared study-room finder

The system: ANU library study-space booking. The slice that annoys: a room
booked for 4 is often used by 1, and nobody else can tell or ask. This app lets
a booker offer their spare seats, lets others join, and is honest that a shared
seat isn't guaranteed.

Spec (from the brief): loads at `*.fly.dev`; models a real ANU slice end to end;
core flow persists across reload; repo shows process (`PROCESS.md`,
`reflections/crit-7.md`); I can account for how I directed, grounded and
corrected the work.

## Decisions already made

- In-app notifications only. No email, no push.
- Fake login, demo only. Users `u1000001`–`u1000005`; **the password is the same
  as the username**. The login page says it's a demo and lists these accounts.
- Rooms and capacities come from `docs/FACTSHEET.md`. Everything is bookable 24/7.
- **Every booking is exactly one hour**, starting on the hour. No custom lengths.
- **Daily limits per person** (per Canberra calendar day, counting the booker's
  own bookings only; joins never count):
  - General ANU room rule: 2 hours (2 bookings) per day. This covers study rooms,
    the Deck and study booths, which **share one pool of 2 per day**.
  - Computer desks: 3 bookings per day, their own pool.
  - The accessibility computer and microfilm scanner aren't specified, so they
    follow the general rule of 2 per day each.
- Bookable up to **2 weeks (14 days)** ahead (real ANU rule); nothing in the past.
- A person can't be in two places at once: bookings and joins can't overlap in
  time for the same person.
- Joining a shareable booking is direct (no approval). Separately, a person can
  send an "ask the booker" request, which the booker can accept or decline. A
  booker can also switch requests off entirely for a booking.
- Shareable bookings show a brief static note: seats on a shared booking aren't
  guaranteed. No timers, no computed no-show logic.
- **Privacy option per shareable booking:** the booker chooses whether their name
  is public. If private, others see "A student" and can still send a request
  through the app without learning who they are. Default: private.

## Deliverables

### Tier 1: must ship (a complete demo on its own)
- [ ] Schema + migration: `users`, `rooms`, `bookings`; rooms seeded from the fact sheet
- [ ] Demo login/logout (cookie session), demo-only note, accounts listed on the page
- [ ] Browse by library, kind and date; see each space's day as an hourly slot grid
- [ ] Book a one-hour slot; server-side clash detection and daily limits; cancel own booking
- [ ] "My bookings" page
- [ ] Core flow survives reload; live slot updates over SSE
- [ ] Deployed to `*.fly.dev`, deployed early and again after each tier

### Tier 2: the differentiator
- [ ] Mark a booking shareable; booker declares the seats they're using
- [ ] Privacy option: show booker's name or not
- [ ] Spare seats = capacity − booker seats − joiners (never negative)
- [ ] Join a shareable booking; leave it; static "not guaranteed" note
- [ ] "Open seats now" view across libraries
- [ ] Capacity-1 spaces can't be made shareable

### Tier 3: if time
- [ ] Check-in: joiners mark arrival; occupancy shows checked-in vs joined, live
- [ ] Ask-the-booker request; in-app inbox with unread badge (live)
- [ ] Booker accepts or declines a request; booker can turn requests off
- [ ] UI polish pass at both viewports

### Cut
Email/push, real SSO, maps, recurring bookings, admin tools, timers or auto-release
of unclaimed seats.

## Spec tests to write (contracts, not implementation)

- Two overlapping bookings of one space: the second is refused.
- Adjacent one-hour bookings (one ends when the next starts) are both accepted.
- A booking is exactly one hour and starts on the hour; anything else is refused.
- A third room booking on one day is refused, even across kinds (e.g. one study
  room plus one Deck plus one more is refused on the third).
- A third computer-desk booking is accepted and a fourth is refused.
- Joining a booking never uses up the daily limit.
- Daily limits reset at the Canberra day boundary, not UTC.
- A booking in the past, or more than 14 days ahead, is refused.
- A created booking is still listed after a fresh request (persistence).
- Joiners can never push a booking over the space's capacity.
- A person can't join a booking that overlaps one of their own.
- A capacity-1 space can't be made shareable.
- A private booker's name never appears in the served page.
- Anonymous users can't create bookings.
- Every page has a route in `spec/routes.ts` (invariants cover it).

## Assumptions to list in the README

- Booths share the room pool of 2 per day (only study rooms and the Deck were
  stated explicitly; booths follow the general ANU room rule).
- The accessibility computer and microfilm scanner follow the general 2-per-day rule.
- Limits live in one table, so any of these is a one-line change.

## Process evidence (part of the mark)

- Small commits that grow with the work: one per feature, not one at the end.
- `PROCESS.md` cites commit hashes and quotes the prompts that produced them.
- `README.md` says what good looks like, and what was cut and why.
- `reflections/crit-7.md`: 150–300 words, both standing prompts.
- Keep notes as we go on where I directed, grounded (fact sheet, brief, spec)
  and corrected the agent, so point 5 of the spec is easy to answer.
- Run `pnpm check` and `pnpm check:evidence` before each deploy.
