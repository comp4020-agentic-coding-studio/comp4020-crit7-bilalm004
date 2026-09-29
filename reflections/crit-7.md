# Crit 7 reflection

**Breakthrough.** Building the interface on throwaway sample data first, with the
rules and facts written down beforehand, let me judge the whole flow visually
before committing to a schema. Merging Search and Timetable into a single page
with pill filters came from looking at real screenshots at phone and desktop
size, not from the code. Keeping every limit in one table and every room in a
fact sheet meant the agent could not quietly invent ANU rules, and I could check
its work against a source.

**Who I want to be.** I want to be a developer who directs and checks rather
than accepts. The agent was fast at producing screens, but the useful moments
were mine: noticing the filter panel was too busy, that the toggle jumped between
views, and that a 65-row grid was unusable. I want to keep that habit of looking
at the actual result at both viewport sizes, grounding decisions in a source, and
writing down why, so I can account for each choice later rather than just
shipping whatever compiled. Tier 3 sharpened that: I fixed the contracts
(schema, rules, API) myself and let agents build screens and tests against them,
and the privacy rule ("never leak a private booker") turned into tests that read the
event stream, not just a promise.
