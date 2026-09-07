# Archived — kept because the reasoning outlives the document

Nothing here is deleted and nothing here is current. Each of these was live once, is superseded now,
and is kept for one reason: the *argument* in it is still cited by the documents and the source
comments that replaced it. A file that gets grepped by name from a code comment cannot simply go.

**If you are looking for what is true today**, none of it is in this folder:

| what you want | where it is |
|---|---|
| what is open, undecided, or owed | `docs/findings/BUILD-STATE.md` (its "What is missing" table). `docs/checklist.md` held this until 2026-09-06 and is now `docs/archived/checklist-2026-09-06.md` — it had drifted the same way BUILD-STATE had. |
| what is built, half-built, not started, audited against source | `docs/findings/BUILD-STATE.md` |
| measured numbers, which override every plan | `docs/findings/P0-FINDINGS.md` |
| where a cold session starts | `docs/HANDOFF.md` |
| the most recent audit of the code against the docs | `docs/findings/COUNCIL-05.md` |
| the four decisions still waiting on Seth | `docs/archived/DECISIONS.md` |
| the plans still being built from | `docs/plans/PLAN-02/03/04/06/07` |

---

## What is in here, and why it stopped being current

**`PLAN-01.md`** — the first plan. Its own header says *"SUPERSEDED — do not follow"*: PLAN-02
replaces it in full. Kept because `COUNCIL-02` reviews it line by line, so the review is unreadable
without it.

**`PLAN-05-TALK.md`** — the scope for talking to Anansi about the story. **Built.** Talk shipped, the
route and the panel exist, and `docs/archived/DECISIONS.md` still points at this for the shape that was
agreed.

**`NEXT-SESSION.md`** — a handoff written at the end of 2026-08-28, marked *superseded in part* the
next day. Items 1–4 of its build order are done, and its framing of item 2 turned out to be wrong in
three ways worth keeping: §2c was already built, §2e is one guard rather than three, and §2a's
answer was that the meter should never have been reading the estimator at all. It is the argument
that produced `BUILD-STATE` §7 and §8, which is why it is worth keeping and why it is not the
current state.

**`COUNCIL-01.md`, `COUNCIL-02.md`, `COUNCIL-03.md`** — three review events on 2026-08-23, before the
app was built. Superseded as *plans* and permanent as *reasoning*: the arbitration rule at
`src/context.ts:18` cites COUNCIL-03 S1 by name, the token-count shape cites COUNCIL-02, and
`bench/measure.py` cites both for where the inherited timing figures came from. Those citations are
the reason these are archived rather than deleted.

**`SPEC.md`** — the build spec, and the engine reference until 2026-09-03. Archived at Seth's
word. It is the *argument* for why the system is shaped as it is and it stopped being a description
of the app some time ago: §9's four writing modes are Co-Write, Direct, Full Auto and New Scene, of
which only the word *Direct* survived, and almost every table it names was renamed when the schema
was built (its own header has carried that table since 2026-08-28). §15.2's "no relations graph" is
also stale — `entry_edges` exists and `context.ts` reads it.

**It does not meet the rule at the foot of this file, and that is written down rather than fudged.**
Four of its §15 gaps were still open when it moved: the golden fixture, the intra-ledger
contradiction check, the cost ceiling and resumable streams. They were carried to
`docs/checklist.md` so archiving could not close them by moving a file. Kept, rather than deleted,
because source comments cite it by section — `SPEC §7.1`, `§7.3/§7.5`, `§9`, `§11`.

**`COUNCIL-04.md`** — six reviewers on the built app, 2026-08-24. **Closed**: all eight findings and
all seven smaller items. Still cited by name from `bench/modes.ts`, `bench/ledger-audit.ts` and
`test/db.ts`, because three of its findings are what those checks exist to catch — the eviction
order, the multi-word key failure, and the mode-prompt shape.

---

## The rule for adding to this folder

A document comes here when **everything it asks for is either built or explicitly dropped**, and it
is still named by something that is not itself. If nothing cites it, it can just go. If something it
asks for is still open, it stays live however old it is — `PLAN-02` is from 2026-08-23 and is not
here, because its §7.2 trigger still gates the budget engine.

Moved 2026-08-28. `SPEC.md` joined them 2026-09-03.
