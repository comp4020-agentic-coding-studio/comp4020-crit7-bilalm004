# Process overview

## What I built

A shared study-room finder for ANU libraries: book a one-hour space, offer spare
seats, let others join. See `README.md` for the app and what good means.

## How I got here

I started from a plan (`docs/PLAN.md`), a fact sheet of real ANU rooms and rules
(`docs/FACTSHEET.md`) and a `CLAUDE.md` of decisions, then built the UI on
throwaway sample data before any schema, so I could judge the flow first.

- Plan, rules and demo data: [`66c53a0...54fe633`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit7-bilalm004/compare/66c53a0...54fe633)
- UI on sample data, then merging Search and Timetable into one page with
  pill filters: [`696d451...63a1cd0`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit7-bilalm004/compare/696d451...63a1cd0)

**Directed:** I chose to merge Search and Timetable, the pill-row filters with
auto-apply, the fixed toggle position and the 390x844 mobile size.
**Corrected:** I pushed back on the too-busy filter panel and on the toggle
jumping between views. **Grounded:** the fact sheet and the 14-day / 2-a-day rules.

- Real bookings: schema, server-side rules (clash, limits, 14 days), book and
  cancel, live slots over SSE: [`5a522bb`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit7-bilalm004/commit/5a522bb). Then
  [`48b5a72`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit7-bilalm004/commit/48b5a72), building the date formatter once after
  Timetable and Earlier/Later lagged (found by using it, not from the code).
- Tier 2, sharing: seats used, private-by-default name, direct joins that never
  use the daily limit, the "not guaranteed" note, the privacy HTTP tests:
  [`583b6ed`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit7-bilalm004/commit/583b6ed).
- Tier 3, in four commits (grouped by layer, not perfectly by feature, because the
  agents' changes touched shared files): schema and pure rules
  [`80acc2f`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit7-bilalm004/commit/80acc2f), server and API [`0622708`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit7-bilalm004/commit/0622708), UI
  [`4cd282d`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit7-bilalm004/commit/4cd282d), HTTP tests [`405e41a`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit7-bilalm004/commit/405e41a).

**Tier 3 prompt:** "so lets do tier 3 - u can use multiple agents where needed to
help be more efficient", with a hand-over brief listing what was done, what wasn't
and the gotchas. I split it three ways: I wrote the schema, migration, pure rules,
DB functions and API routes myself (so the contracts were fixed), then gave one
agent the inbox, header badge and My bookings, one the Find a space details panel,
and one the spec tests (`spec/tier3.test.ts`).

**Directed:** the tier order and scope (from `docs/PLAN.md`), that the SSE stream
must carry no user id (so the `inbox` event is a bare ping and each client asks
`/api/unread` for its own count), that Base owns the tab's single stream because of
the 6-connections-per-site limit, and that only `pnpm check` green gates a deploy.
**Grounded:** the brief (rechecked: it still says nothing about these features),
`docs/PLAN.md` and the rules in `CLAUDE.md`. **Corrected:** an agent found that its
tests broke `sharing.test.ts` when it booked as the same person and moved to a
different booker; agents also reported what they did not verify (Timetable view,
Accept/Decline clicks, the live badge, the "Checked in" state against real data),
which I list rather than claim.

