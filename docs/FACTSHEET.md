# Fact sheet: ANU library bookable spaces

Source: the user's pasted ANU room-booking timetable views (29 Sep – 1 Oct 2026)
for four libraries. This file is the reference for seeding the `rooms` table and
for any copy that mentions rooms. If a fact isn't here, it's unknown: don't
invent it (see "Unknowns").

**81 bookable spaces across 4 libraries.** Capacity is the number of seats the
source lists. Room names are kept exactly as the source writes them.

## Menzies (4 spaces)

| Space | Kind | Capacity |
|---|---|---|
| Study room 115A | study room | 7 |
| Study room 115C | study room | 3 |
| Study room 115E | study room | 3 |
| Microfilm Scanner | equipment (microform scanner) | 1 |

## Hancock (9 spaces, all study rooms)

| Space | Capacity |
|---|---|
| Study room 3.27, 3.28, 3.29, 3.33, 3.34, 3.36, 3.38, 3.39 | 4 each |
| Study room 3.37 | 3 |

## Chifley (64 spaces)

| Kind | Spaces | Capacity |
|---|---|---|
| Study room | 1.01, 1.02, 1.03, 1.04, 1.05, 1.06 | 4 each |
| Study room | 2.02G | 4 |
| Study room | 3.04, 3.05, 3.06, 3.07 | 4 each |
| Study room | 4.02, 4.03, 4.04, 4.05, 4.06, 4.07 | 2 each |
| The Deck | The Deck | 8 |
| Accessibility computer | Accessibility Computer | 1 |
| Study booth | 3.11, 3.12 | 2 each |
| Study booth | 3.10, 3.13, 3.14, 3.15, 3.16, 3.17, 3.18, 3.19, 3.20, 3.21, 3.22, 3.23 | 4 each |
| Computer desk | 2.22 – 2.52 (31 desks, consecutive) | 1 each |

Counts: 17 study rooms, 1 Deck, 1 accessibility computer, 14 booths, 31 desks.

## Law (4 spaces, all study rooms)

| Space | Capacity |
|---|---|
| Study room 1, 2, 3, 4 | 4 each |

## Kinds (for the `kind` column)

`study_room`, `study_booth`, `the_deck`, `computer_desk`, `accessibility_computer`,
`microfilm_scanner`.

## Hours

All four libraries are bookable **24/7** (stated by the user; consistent with
the source grid covering 00:00–23:00). The app has no opening-hours rule: any
future hour is bookable. Times are Australia/Canberra.

## Booking rules (stated by the user)

- Every booking is one hour.
- General ANU room rule: 2 hours per person per day.
- The Deck: at most 2 bookings per person per day.
- Study rooms: at most 120 minutes (2 bookings) per person per day.
- Computer desks: at most 3 bookings per person per day.
- Advance window: up to 2 weeks ahead.
- Joining someone else's booking does not count toward any limit.
- Not stated, so assumed: study booths share the room pool of 2; the accessibility
  computer and microfilm scanner follow the general 2-per-day rule. List these
  as demo assumptions in `README.md`.

## What the source timetable shows

- A day is a 24-hour hourly grid (00:00–23:00); the source view spans three days.
- Rows are spaces grouped by kind; columns are hours.
- Some spaces carry an "Info" link in the source; the Deck and the booths don't.
  The link contents were not provided.

## Design consequences (decisions, not source facts)

- **Sharing only makes sense where capacity ≥ 2.** The 33 single-seat spaces
  (31 computer desks, the accessibility computer, the microfilm scanner) are
  bookable but not shareable.
- Capacity is the hard ceiling for `booker seats + joiners`.
- Locations are seeded from this file through a migration, never typed in by
  hand into the deployed database.

## Unknowns (do not assume in copy or tests)

- Who is eligible to book (staff, students, HDR).
- Cancellation and no-show rules of the real ANU system.
- What the "Info" links say.

Where the app needs a value for any of these, pick a simple default, state it as
a demo assumption in `README.md`, and keep it in one constant.
