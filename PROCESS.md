# Process overview

## What I built

A study room finder/booker for ANU libraries, as the ANU system felt a bit outdated/generic. Also, experiencing Uni feel very full and difficult to find spaces to study at times, I added a feature where spare spaces in rooms could be opened up for others to join if booked.

## How I got here

Before getting to developing, with Claude I formed a PLAN and FACTSHEET file, containing information on the plans and the facts, including library buildings, rooms, capacities, number of bookings allowed, and so forth ([plan, fact sheet and rules](https://github.com/comp4020-agentic-coding-studio/comp4020-crit7-bilalm004/compare/66c53a0...54fe633)).

Then I focused on the UI - getting the site layout and features to what the aim was, before comitting to creating the, more expensive, backend ([UI on sample data, then merging Search and Timetable into one page](https://github.com/comp4020-agentic-coding-studio/comp4020-crit7-bilalm004/compare/696d451...63a1cd0)). I gave Claude ANU theme colours (which can be seen in the site, for example, the Gold accents), as well as freedom to add other colours to make the app feel more modern. Note, the in use ANU site for room booking does not follow the ANU colour theme by the looks of it either.

The backend then went in tier by tier, deploying after each:

- **Tier 1, real bookings** (schema, server-side rules, live slots): [`5a522bb`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit7-bilalm004/commit/5a522bb), then [`48b5a72`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit7-bilalm004/commit/48b5a72) for the Timetable lag.
- **Tier 2, sharing spare seats:** [`583b6ed`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit7-bilalm004/commit/583b6ed).
- **Tier 3, check-in, ask-the-booker and the inbox:** [`80acc2f`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit7-bilalm004/commit/80acc2f) (schema and rules), [`0622708`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit7-bilalm004/commit/0622708) (server), [`4cd282d`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit7-bilalm004/commit/4cd282d) (UI), [`405e41a`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit7-bilalm004/commit/405e41a) (tests), then a polish pass [`20eeb5c`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit7-bilalm004/commit/20eeb5c).

Another key part of the process was developing using the new Sonnet 5.5. I noticed, as compared to other crits/projects, I was getting turnback from Claude much faster, and much cheaper, demonstrating how staying up to date with the models can provide real, noticeable, benefit.

