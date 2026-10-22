# Anansi — working notes for Claude

Local-first long-form fiction app. Zero dependencies, no build step, no cloud. Node 26+ native
TypeScript stripping and `node:sqlite`. There is no `package.json`; do not add one, and do not add a
dependency without asking.

## First command, every session

```bash
node --experimental-strip-types status.ts
```

Everything it prints is derived at the moment you run it: routes, debt markers, tables on disk,
whether the search index is actually populated, **which prompt flags the running server has**, and
how old each backup is. Nothing in it is typed by hand.

Read it instead of trusting a number written in a document — including the ones in this file. On
2026-09-06 five separate documented claims were wrong the same way: true when written, quietly
false later. That is the failure mode here, and it is why this command exists.

## Before you change anything

```bash
node --experimental-strip-types test/all.ts     # every suite; it prints its own total
```

`.githooks/pre-commit` runs it on every commit once `git config core.hooksPath .githooks` is set
(once per clone). Runs on the machine queue behind `test/lock.ts`, so parallel worktrees wait their
turn instead of colliding on the fixed ports and `/tmp` databases.

Run it before and after. No model needed, so there is no excuse for skipping it. It runs the thirteen
unit suites **and all seventeen `check` modes under `bench/`**, in parallel, in about 11 seconds.
Each bench entry is spawned with its own `ANANSI_DB`: fifteen of the seventeen touch no database,
`bench/rooms.ts` opens one, and without that guard it would open the live library read-write and
migrate it mid-run.

The browser harness is separate and slower: `bash test/ui/run.sh`.

**Ports.** `test/scope.ts` owns **5187–5190 and 5194–5196**; `test/ui/run.sh` takes 5179; the live
server is 5174 **over HTTPS** — `curl http://…:5174` fails with the same `000` a dead server gives,
so use `curl -sk https://…`. Give any scratch server a port well clear of those; 5301/5302 are the
convention for A/B arms. A stray server on a scope port makes it report an ownership failure that is
not there, because a real server answers 200 where the fixture expects 403.

`scope.ts` waits **40 seconds** for a child to boot, not 10. That is not padding: the old bound
produced five "no server came up on 5187" failures that were written down three times as an
unexplained flake. The child was alive every time and still starting — node parses ~200 KB of
TypeScript with no build step, then calls the router before it listens. It only ever waits that long
when something is genuinely wrong.

## Where the truth lives

**Docs drift from the code. The code wins.** When they disagree, read the code and fix the doc.
Run it; do not cite it.

1. **`docs/findings/P0-FINDINGS.md`** — measured numbers, 60 findings. The most valuable thing in
   the repo: these cost GPU time and cannot be re-derived by reading source. 47 F-numbers are cited
   from code comments explaining why something is the way it is.
2. **`docs/findings/BUILD-STATE.md`** — what is built and what is missing, with the command that
   checks each line. Rewritten from scratch 2026-09-06 after the previous version reached 1,138
   append-only lines and was wrong in five places. **It is rewritten, never appended to.**
3. **The debt ledger**, harvested from the code rather than remembered:

   ```bash
   grep -arn "ponytail:" src web bench test *.ts *.html | wc -l
   ```

   **Note the `-a`.** Without it grep silently skips any file it decides is binary, and
   `bench/compact.ts` was binary for months — it used two literal NUL bytes as a composite-key
   separator, so the published command could not see the marker in it and the ledger read one low.
   They are written as a backslash-u escape now (u plus four zeroes), verified byte-identical
   at runtime. Note that this very sentence was first drafted with a LITERAL NUL in it, as an
   example, which turned this file binary too and took three attempts to remove -- the lesson
   is that prose about a control character must DESCRIBE it, never contain it.
   `-a` stays so the next raw byte
   somebody pastes cannot cost a third undercount. **This is the third time the ledger has been
   wrong because the command could not read everything** — the other two were `test/` missing from
   the path, and a per-file tally copied by hand. A count is only derived if the command sees the
   whole tree.

**There is no `docs/archived/`.** It held 18 superseded documents and 7,029 lines and was deleted
on 2026-09-07, once the code had been made self-contained: no comment defers its meaning to a
document any more, so nothing in `src/` needs one to be readable.

Comments still carry names like `PLAN-08 Phase 2` and `SPEC §7.1`. **Those are historical labels,
not paths** — the document is in git history and nowhere else. The sentence around the label is
the whole meaning; if one ever is not, that is the bug, and `test/web.ts` fails on the phrases that
produce it. Do not go looking for the file, and do not re-create it.

## Conventions that are not negotiable

- **Blocks are named, never numbered.** `src/blocks.ts` holds one order and it has no integers.
- **`buildContext` is pure.** No I/O below the line marked in `src/story.ts`. Flags reach it through
  `Input`, never `process.env`.
- **`render.ts` is the only place block order becomes text.**
- **Every route is gated.** `serve.ts` fails closed on ownership; `test/scope.ts` proves it with two
  owners. An audit once found zero ownership checks on 27 routes.
- **One parser, one predicate, one place.** `db.keysOf` parses keys; `MINE()` is the one ownership
  clause; `src/import.ts` is the only importer. The most expensive recurring bug in this repo is
  *two things that must agree, and only one of them guarded* — `BLOCK_ORIGIN` vs `BLOCK_COLOR`, two
  MODES whitelists, api-method→caller guarded in one direction only. Prefer a floor in the shared
  function over a guard at each call site.
- **A deliberate shortcut gets a `ponytail:` comment** naming its ceiling and upgrade path.
- **Anything a writer would notice goes in `docs/WHATS-NEW.md`, in the same commit.** That file IS
  the What changed screen — `GET /api/whatsnew` reads it, no model call, no cache. Newest first,
  `##` is a release (`YYYY-MM-DD · headline`), `###` is one thing in it. Write it for the person who
  WRITES BOOKS: no file names, no function names, no refactors, no test work. A commit that changes
  nothing they would notice gets no entry.
- **Never write a raw control byte into source.** Use the escape. See the ledger note above.
- **The code is self-contained.** Seth, 2026-09-07: *"the code should be self-contained."* Citing a
  document is fine as PROVENANCE — "PLAN-08. The wardrobe moved into `addons` as the `outfit` slot"
  reads without opening anything. Deferring MEANING to one is not: "PLAN-02 §7.2 holds the trigger
  condition" made a reader leave the file, and for weeks nobody noticed that the sentence beside it
  named the wrong test — §7.2 says the trigger is explicitly NOT overflow, while the comment gave
  "nothing has overflowed" as the reason for deferring. A document can be archived, renamed or
  superseded; a comment pointing at one inherits all of that. `test/web.ts` keeps the count at zero.

### Vertical slices, and where they stop

`src/search.ts` is the pattern: one feature owning its schema, its triggers, its index backfill, its
query grammar and its SQL shape, in one file. It replaced the same feature living in four places
inside `db.ts` — the schema at one end, the backfill two hundred lines earlier in `migrate()`, the
query fifteen hundred lines later.

**What makes it a slice and not a fragment: it owns the KNOWLEDGE, `db.ts` keeps EXECUTION.** It
never opens a database, and it never defines the ownership gate — `MINE()` is handed in as a string
by the one module entitled to own it. The alternative was exporting `q` (233 uses) so the slice
could run its own SQL, and passing the security predicate around. Neither is acceptable.

So the test for the next slice: **can it own its knowledge without owning the primitives?** If it
needs `q`, it is not a slice. And the layered modules that are left — `db.ts`, `routes.ts`,
`context.ts` — are not a mistake to be undone: the dependency graph is clean and acyclic, and a
typical change here touches one to three files. The size of those three is the problem, not the
shape. Cut a slice out when a feature is genuinely self-contained; do not restructure to a plan.

**Splitting creates a new pair that must agree.** `searchSQL` builds placeholders and `searchArgs`
builds values; a mismatch returns wrong rows silently rather than erroring. Guard the seam in the
same commit that cuts it — `test/db.ts` does, and the guard caught a bad test on its first run.

### Comments are load-bearing, and they drift too

38% of this tree is comment — 59% in `context.ts` — and it is the reason the code is workable: the
comments carry *why*, and the arguments that were settled. Keep writing them.

But they go stale like any other prose, and a stale comment is worse than none because it is
authoritative and touching the code. Three were found wrong in one day: a note claiming `--dock`
"survives for the big composer" weeks after nothing referenced it; a note saying three columns were
unread when two had been read for a fortnight; a harness header calling itself read-only directly
above the line explaining that it is not.

**When you delete or rename something, grep its name in comments before you commit.**

## Hard-won rules about measurement

The findings are this project's most valuable asset. Six rules, each bought with a wrong answer:

- **Validate the detector before believing the result.** A check that never fires reports
  perfection. F17 ships 22 synthetic cases asserting both directions.
- **Validate it against something it was NOT written for.** This is the sharpened version and it is
  the most expensive class here. A detector is usually correct for its home fixture and silently
  wrong elsewhere: `bench/lockout.ts`'s verb list is past-tense only and reports a *present-tense*
  book as flawless; `bench/sweep.ts` read its own explanatory comment as evidence, three times; the
  search backfill probed emptiness with a `COUNT(*)` that reads the content table and answered
  "full" on an empty index. Every one passed its own tests.
- **Report the informative denominator.** Say how many runs *could* have failed (F10).
- **Falsify the test, not just the code.** Break the code on purpose and watch the *named*
  assertion go red, or it is decorative. It caught four real defects in one day.
- **A guarded assertion can stop running and still report green.** `if (thing) { ...checks... }`
  with no `else` is invisible to a count-based harness.
- **A zero is not an absence.** Say "under X%", never "fixed" (F12).

And one about comparing runs: **a treatment measured against a baseline that has since been improved
does not carry its old number forward** (F57–F59). Densities are comparable only *within* one
simultaneous run — this fixture's baseline drifts by half between runs (F55).

Nothing sets a seed at the arm level, so only A/B arms run **simultaneously** are controlled: two
servers against one router, differing by one env flag, with the treatment verified through
`POST /api/manifest` **before** generating. `bench/lockout.ts` and `bench/lockout-book.ts` do this.

## Checks run against narration only

Dialogue may lie; characters may be wrong. Only the narrator commits the story. Every quality check
strips quoted spans first. Ignoring this produced a long run of false positives — a place name,
another character's name, a line of dialogue read as a POV break.

## The model

`Qwen3.6-WNTH-35B-A3B-NN` on `:8080`, 50,048 tokens per slot (two slots, `kv_unified`). The preset
list was renamed on 2026-08-27; the old `write-nt-*` names return `400 model not found`.
`ANANSI_MODEL` overrides the default in `llama.ts`; a story may pin its own in `stories.model`.

It is a reasoning model: **`chat_template_kwargs: {enable_thinking: false}` is sent on every call
unless the book weaves.** With thinking on at a prose cap it returned no prose at all on three runs
of four (F5), and structured roles truncate their JSON the same way (F23). Weaving (the writer's
word; the code's flag is still `enable_thinking`) is a per-book switch, off by default: only the
roles on `WEAVING_ROLES` in `routes.ts` turn it on, and `replyFor` raises their cap by 5,000 so the
plan cannot eat the passage (F60). Every other call sends it off. Never raise a cap for weaving
anywhere but `replyFor`, or the Context panel previews a budget the call does not use.

Two concurrent writers at full budget fit with a ~5,700-token margin. Oversubscribing the shared
cache does not queue — both requests die with HTTP 500. **Do not raise the per-slot budget.**

**A story's voice field outranks everything for register — but only if it is written like an
instruction** (F37): the same rule buried in a long line bought nothing; on its own line, naming
*narration* with the forms spelled out, it holds at ~98% even against prose that contradicts it. Do
not add register rules to SYSTEM; a clause there measured 98.0 against 98.0 and was deleted.

**Prompt clauses measure flat more often than not.** `CANON-REPEAT` (F20), the SYSTEM register
clause (F37) and `ANANSI_LOCKOUT_NAMED` (F54, refuted across three fixtures and ~3,400 generations
in F57–F59) all measured indistinguishable from their own controls and were deleted rather than kept
as switches. Ask for the control arm before writing the clause.

**The lockout's leak is located** (F59): across 400 generations of a real book it stops the model
writing the locked character's *dialogue* (0/400) and *interiority* (0/400) absolutely, and acts for
him in **20% of generations**. That one third is the whole open problem; the other two are solved.
