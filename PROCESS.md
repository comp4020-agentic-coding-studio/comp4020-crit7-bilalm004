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

Remaining work (schema, real bookings, sharing, deploy history) will be added here.
