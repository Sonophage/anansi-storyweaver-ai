# Coding standards — for the reviewer

Read at review time. The project's conventions live in `.claude/CLAUDE.md`; this file holds the judgement calls a reviewer checks a diff for that no test can.

## A comment stays on the thing it explains

New code goes above a comment block or below the thing the comment describes, never between them. A docblock left sitting on the wrong function is authoritative and wrong. Check every insertion that lands directly under a `/** … */` or a run of `//` lines: does the comment still describe the line below it?

Seen in spec #41: once in review round 1 (`armed()` in `web/app.js`), twice in round 2 (`DELETE /api/after` in `src/routes.ts`, the #47 note in `src/story.ts`).
