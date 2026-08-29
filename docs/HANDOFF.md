# Handoff — 2026-08-28, end of the surface-and-threads day

Branch `serial`, current, pushed, tree clean. `main` is 26+ commits behind and has not been
touched. Read `.claude/CLAUDE.md` first; this file is what a cold session needs on top of it.

## Where the work is

**PLAN-08 (`docs/plans/PLAN-08-THREADS.md`) is the live plan.** It absorbs issues #5 and #13 and
PLAN-06 §2e into one job, because they are one question: what is in a card, and what makes a piece
of it reach the model. Phases 1 and 2 are done. Phase 3 is half done.

| phase | state |
|---|---|
| 1 · the flip + a probe | **done.** F38 is the number. Two changes shipped, two held with reasons. |
| 2 · the schema, once | **done.** `addons`, `entry_edges`, `retired_at_chapter`, `proposals.field`/`.activation`. |
| 3 · the context path | **half.** Addons reach the model; **edges do not**, and the cap is unmeasured. |
| 4 · chapter end | **not started.** #5's scan, clothing routed to outfits, #12's ritual step. |

### What Phase 3 still owes

1. **Directed edges are stored and never read.** `entry_edges` has `parent_id`, `child_id`,
   `confidence` and its own `keys`, and `buildContext` does not look at the table. A parent that
   fires should pull its children in, worth less than a direct hit — `confidence` is the number and
   nothing spends it yet.
2. **The cap is unmeasured, and this shape makes the risk WORSE.** One entry used to be one block;
   it is now one block plus N rooms, and plural slots accumulate without limit. COUNCIL-04 #7 was 46
   entries firing at once — this is the same failure at a finer grain. Re-run `bench/fires.ts` with
   addons switched on before calling Phase 3 done, and decide what the eviction order drops first:
   a whole card, or its rooms before its spine.
3. **`worn()` and the outfit slot are a temporary pair.** The migration COPIED `outfits` into
   `addons` and the surface still writes the old table, so `src/context.ts` skips the `outfit` slot
   and `web/app.js` skips drawing it as a room. Both clauses come out together on the day the
   wardrobe writes addons — and `test/ui/panels.js` asserts the coat reaches the prompt exactly
   once, so deleting one clause alone goes red rather than silently doubling it.

## What shipped today, in one line each

- The composer: the mirror follows the box's scroll, the caret stopped drifting (one font
  declaration for two boxes), a restored line comes back visible, Save stopped running off a narrow
  screen, the maximized composer wears the send blur over 30% of the theme's paper.
- Threads: a card has rooms (`addons`), a **face** that prints only what is filled in with a switch
  per room, a **form** that draws every room to be fillable, jump links per room, and Anansi can
  write the card you are looking at or any single room of it.
- Navigation: her mark at the far left of the bar is the main menu on every screen; a workspace
  page's own title opens it too; in a story the story's name opens the story menu and the web pill
  on the right opens Anansi. `+ Threads` and `Threads` are two different doors on the composer row.
- The send veil weaves a 6x11 grid of glyphs and resolves the middle column to ANANSI before it
  fades.

## Traps this repo has already paid for

- **A backtick inside a template literal is fatal and does not look like it.** In `web/app.js` the
  markup's HTML comments are inside the string: one backtick closes it, the file still LOADS, and
  the function throws at call time so a panel renders as nothing. In `src/db.ts` the same thing in a
  SQL comment fails as a TypeScript syntax error a long way from the cause. **Five times in one
  day.** `test/web.ts` and `test/db.ts` both check for it now — run `test/all.ts` before hand-rolling
  a smoke test. A `${` in one of those comments is an interpolation and does the same.
- **`test/ui/run.sh` reads `$1` only.** `run.sh a b c` silently runs `a`. Quote them: `run.sh "a b"`.
- **Guards that cannot read what they guard report perfection.** `test/web.ts` refuses a button
  whose action attribute is interpolated, and wants `<button data-panel="x"` with the attribute
  first — it was burned once by matching its own explanatory comment.
- **A leftover server on a bench port breaks `test/scope.ts`.** It boots its own on 5187-5196; a
  stray debug server on 5188 makes the allowlist test report a broken gate. Kill by port, not by a
  `pkill` on an env var, which never matches.
- **Seth runs the browser harness only when he asks for it.** Test what you touched. Be honest that
  a change to a shared view (the card's default, for instance) touches every scenario that opens a
  thread — three broke that way today and only a full pass found them.

## Numbers that override the docs

`docs/findings/P0-FINDINGS.md` beats `SPEC.md` and every plan. The two that matter most here:

- **F38** — the ledger's keyword path is NOT dead: 107 firings in 148 eligible entry-positions.
  PLAN-06 §2e's "best-tested dead code in the app" was true of a twelve-entry library on
  2026-08-27 and is not true now. §2e is marked superseded.
- **`bench/ledger-audit.ts` governs whether anything may be flipped to `triggered`**, and says
  existing rows may not: 1 in 12 would go dark and 2 more are "safe on the record, dark on the next
  call". `bench/fires.ts` is its per-position sibling and should be folded into it one day; it
  reports the denominator, which the older file does not.

## Open, and not being worked on

Issues #7, #9, #11, #12, #14. #9 (contradictions arriving late) is **downstream** of PLAN-08, not
beside it — the check reads the ledger, so fielded cards change its inputs and doing it first is
work thrown away. `serve.ts`'s three `ponytail:` markers are untouched: `:81` a reverse proxy breaks
the loopback rule OPEN, `:208` no backpressure now that a phone is on the tailnet, `:54` whois
cached per process. Twenty-four `ponytail:` markers across the tree.

Parked with its reasoning in `docs/checklist.md`: attaching an image to an issue.

## Unverified by anyone but the harness

The talk-draft handoff (`web/app.js`, the "hand it to the composer" path) has no test — reaching it
needs a real generation. It is verified by reading only, and that is written down rather than hidden
inside a green count.
