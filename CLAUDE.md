# CLAUDE.md

## What this is

COMP4020 Crit 7 prototype: a shared study-room finder for ANU libraries
(Menzies, Hancock, Chifley, Law). Book a space, offer spare seats, let others
join, check in. Astro (server output) + Drizzle + SQLite, deployed to Fly.io.

Read before building anything:
- `docs/PLAN.md`: tiers, decisions already made, spec tests to write
- `docs/FACTSHEET.md`: the only source for rooms and capacities
- Brief: https://comp.anu.edu.au/courses/comp4020-agentic-coding-studio/crits/07-anu-system/
  (marked draft; the version published the week before the crit applies)

## Commands

- `pnpm dev`: run locally (DB at `.data/app.db`)
- `pnpm check`: typecheck + build + all `spec/*.test.ts`. Must be green before commit
- `pnpm check:evidence`: PROCESS.md/reflection/CLAUDE.md check. Run before deploy
- `pnpm db:generate`: turn a `src/lib/schema.ts` change into a migration
- Deploy (repo private): `flyctl deploy --remote-only --ha=false -a <repo-name>`

## Rules

**Data**
- `src/lib/schema.ts` is ground truth. Change it, run `pnpm db:generate`, commit
  the schema and the migration together. Never edit the database by hand.
- Seed rooms in a migration from `docs/FACTSHEET.md`. Don't invent rooms,
  capacities or booking rules. All spaces are bookable 24/7. If unknown, use one named constant
  and list it as a demo assumption in `README.md`.
- Validate on the server. Clash detection, capacity limits and ownership checks
  live in server code, never only in the UI.
- Times: store as UTC ISO strings, treat a booking as half-open `[start, end)`
  so back-to-back bookings don't clash. Display in Australia/Canberra.
- Every booking is exactly one hour, starting on the hour. Reject anything else.
- Daily limits are per person per **Canberra** calendar day (not UTC). Study
  rooms, the Deck and booths share one pool of 2; computer desks get 3; the
  accessibility computer and microfilm scanner get 2 each. Keep all limits in
  one table, one place to change.
  Bookable up to 14 days ahead, never in the past.
- A person can't have overlapping bookings or joins. Joining doesn't count
  toward the daily limit.

**Behaviour**
- In-app notifications only: no email, no push, no third-party services.
- Login is a fake demo login: users `u1000001`–`u1000005`, password equals the
  username. The login page must say it's a demo and list the accounts. Never
  present it as real ANU sign-in.
- Shareable bookings carry a brief static "seats aren't guaranteed" note. No
  timers, cron or auto-release (the Fly machine auto-stops when idle).
- Booker privacy is a per-booking option, default private. A private booker's
  name must never reach the page, the SSE stream or an API response; others
  see "A student". Requests to a private booker still work through the app.
- Joining a shareable booking is direct. "Ask the booker" requests are separate,
  and the booker can decline them or switch them off.
- Capacity-1 spaces are bookable but never shareable.
- One Fly machine only: the SSE bus is in-process (`src/lib/events.ts`).
  Don't add a second machine or change `fly.toml`'s machine/volume/auto-stop.

**Spec and tests**
- Add every new page to `spec/routes.ts`, or the invariants silently skip it.
- Keep the shipped invariants and `readme.test.ts` green. Never delete them.
- Write spec tests for contracts (see `docs/PLAN.md`), in `spec/*.test.ts`.
- `guestbook.test.ts` and the guestbook code retire once the real flow replaces it.
- `/readme/` must serve all of `README.md`. Keep README honest: say what was cut.

**Security**
- Keep Astro's CSRF origin check on. Never set `security.checkOrigin` to false.
- No secrets in the repo. The Fly token lives in `mise.local.toml` (untracked).

## Look and feel

Modern, calm, lots of white space; 12px rounded cards, pill badges and buttons,
system font. All colours are CSS variables in `src/styles.css`: use them, never
hard-code hex in components. The ANU palette: black and white carry the page,
**gold `#BE830E` is the highlight** (under ~1/8 of a page, never a large
background), gold tint `#F5EDDE` for callouts, Unigrey `#333333` for text.
- Not limited to ANU colours: soft cool blues (`--cool-*`) are the calm supporting
  colour: pale page background, `.panel` tool areas (search filters, timetable
  header), hover and info callouts, links. Blue never carries status meaning.
- Gold on white is only ~3.3:1: never small text on a light background. Use it
  for fills with black text, borders, dark surfaces, icons.
- Gold means "shared, seats open". Free is green, booked is grey, error is red.
  Status is never colour alone: always an icon and a word.
- Header is black; primary buttons black (white in dark mode), gold on hover.
- Light and dark both follow the system setting. Respect reduced motion.
- Layouts: one **Find a space** page. A row of filter pills (library, type, when,
  people) drives two views switched by a List | Timetable toggle: a flight-style
  results list (with an hourly availability strip) and the Timetable grid, both
  opening the same details panel. `/timetable/` redirects to `/?view=grid`.
  Inbox icon (unread badge) and user menu (sign in/out, a `<details>`) sit top right.

## UI checks: both viewports, every time

Any change that touches UI is not done until I have looked at it at **both**:
- **Mobile: 390 × 844**
- **Desktop: 1280 × 800**

Load the page in a headless browser (Playwright via `npx`, or the `run` skill),
screenshot both sizes, and actually view the images. Check:
- no horizontal scroll at 390px; nothing clipped or overlapping
- tap targets at least 44px on mobile; slot grid usable by touch and scroll
- the demo-login note, the "not guaranteed" note and error states are visible
- keyboard focus is visible; colour contrast is readable (axe in CI skips contrast)

Say which pages were checked at which sizes when reporting UI work. Don't claim a
UI is fine from the code alone.

## Process (part of the mark)

- Small commits that grow with the work: one per feature, message says why.
  Commit only when asked. End messages with the attribution line the harness gives.
- Deploy after Tier 1 and again after each tier. Don't leave deploying to the end.
- Keep `PROCESS.md` current as we go: cite commit hashes, quote the prompts that
  produced them, and note where the user directed, grounded and corrected.
- `reflections/crit-7.md` is required: 150–300 words answering both prompts in
  `reflections/README.md`.
- Report outcomes plainly: if a check fails, say so with the output.
