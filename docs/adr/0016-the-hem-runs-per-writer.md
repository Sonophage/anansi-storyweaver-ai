# The hem runs per writer, and Anyone new is one call

Seth decided this on 2026-11-06 (late and night). The rules from 2026-11-01 at the end still stand.

## Why

Kia needs the Timeline to keep moving without the questions a full hem asks. The old hem made two
calls to find new threads (New threads, then a needs ask), and its status list did not follow the
order the passes ran.

## The decision

- **The status list follows the order the passes run**: summary, finished, tale, memory, next,
  facts. The drawer and Hem again use one order (`HEM_PASSES` in `src/routes.ts` equals `PASSES`
  in `web/app.js`).
- **A basic hem, per writer.** It runs the summary, where the tale stands, and the people
  (`BASIC_HEM`). It never asks and has no who step. Hem again runs the same three, and the drawer
  lists only those three. The writer picks it in Account, You, How you hem (`users.hem`). It is on
  for Kia; Seth is on Full.
- **New threads are merged into Anyone new**: one call that reads the prose and the next scene's
  plan. Its finds go to the closing scene's card. The pockets for the next scene's start (outfit,
  mood) were dropped.
- **The next-scene step is named "Drafting the next scene's opening".** It writes the title, the
  opening and where it heads, never prose.
- **The hem reviews up to ten threads** (`HEM_THREADS`). New threads per hem stay at six.
- **The played character is kept outside by name.** An alias thread (for example "The Narrator"
  for the played character) is fixed by hand. Code that marks an alias is built only if one appears
  on the live library.

Earlier rules, 2026-11-01: who is in a scene at its start is who its brief names; other always-on
threads are mention only; a key that names another thread wakes nothing; the hem passes run one at
a time; one keyword per new thread; the brief is the hem's first question; a thread has four
states.

## What it costs

- Anyone new was not measured against the two old calls. The old code is at `70b13ea` and
  `40e6e47`.
- New threads share one cap of six with the scene's own threads (a `ponytail:` in `hemPasses`).
