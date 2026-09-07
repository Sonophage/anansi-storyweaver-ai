# The plan — everything open, and nothing that is done

**Written 2026-09-07 by replacing six plans with one.** Every line below was checked against the
source on that day, with the command that checked it. Nothing here is copied from the documents it
replaces; those became history the moment their work landed and are archived, not deleted, because
the code cites them 126 times between them.

> **This file is REWRITTEN, never appended to.** A plan that is only ever added to describes
> intentions in the present tense forever, which is how `PLAN-06 §2c` came within two commits of
> re-implementing something that had been built a fortnight earlier. When an item ships, delete its
> entry — the record of what happened lives in git, in `WHATS-NEW.md` and in `P0-FINDINGS.md`.

> **Check before believing.** `node --experimental-strip-types status.ts` derives the counts;
> `docs/findings/BUILD-STATE.md` carries the command for each "what is missing" line. If this file
> and the code disagree, the code wins and this file is the bug.

---

## Decisions waiting on Seth

Nothing below gets built until these are answered. They are not work items; they are forks.

**1 · Interiority, and the 82.5%.** F21 measured the model narrating the protagonist's inner state
in **82.5% of generations** with nothing in canon asking for it, and writing a character's inner
state into canon comes back as the narrator asserting it **47.5%** of the time [39–56]. F59 has
since located a narrower version of the same thing: with the lockout on, the model writes the
locked character's *dialogue* and *interiority* never, and his *action* in 20% of generations.
The open question is whether the 82.5% is a defect to attack or the register you want. **Nobody has
decided, and it is the largest single number anyone has measured about this app's prose.**

**2 · Per-account prompt overrides.** Seeing the prompts is built (`GET /api/prompts`, the forge,
and `prompt_overrides` is a live table). What is undecided is how far editing should reach: base
prompts per account, per story, or neither.

**3 · Character by prompt.** Spark's shape aimed at one character. `POST /api/invent` builds a card
from a prompt today; the undecided part is what it should fill — name, body, type and trigger words
only, or also rooms, states and connections.

**4 · Keeping a writer's prompt warm.** Measured 2026-09-07 across 759 prose runs: p50 **9.7 s**,
p90 **44.5 s**, p99 **115.3 s**. The tail tracks the gap since the last generation — 8.1 s while
writing continuously, 20.7 s after 1–5 minutes, 33.2 s after 5–15. It is the prompt cache, not the
model unloading (a gap over 15 minutes is *faster* than 5–15, so sleep-idle is not the cause).
Holding a writer's prefix warm would be the single biggest change to how the app feels. It costs
GPU for someone who has stopped typing. **Seth's call.**

---

## Open work, verified missing

Each line names how it was checked. Re-run the check rather than trusting the line.

| | What is missing | Checked by |
|---|---|---|
| **Activation depth** | secondary keys, `key_logic`, proximity bound, exclusion keys, regex keys | 0 live hits for each in `context.ts`/`db.ts`; no column on `entries` for any |
| **Budget engine, the rest of it** | reservation, trim ladder, `partial` block state. **Eviction is NOT missing** — built 2026-08-29 | `grep -n "evict\|reserve\|partial" src/context.ts` |
| **Internal coherence** | nothing checks a passage against *itself*; the checker only compares passage→canon | 0 hits |
| **Canon against canon** | two cards may contradict each other and nothing notices | 0 hits |
| **Resumable streams** | the passage persists and is marked "written while you were away"; the page just does not repaint until something else makes it | no `visibilitychange` handler in `app.js` |
| **Per-writer cost or time ceiling** | `generations` records enough to enforce one; nothing does | no quota or rate limit in `routes.ts`/`serve.ts` |
| **Service worker / offline read** | — | no registration anywhere, no `sw.js` |
| **`writerStats` counts only books you own** | a shared book is mostly somebody else's words | reads `s.owner_id = ?`, not `MINE()` |
| **A shared passage cannot say WHICH hand wrote it** | fine for two writers, not three | `passages.author` holds only `human`/`model`; no writer id column |
| **Vector recall** | Options A/B/C from the old memory plan. Needs Postgres and pgvector, both unscheduled | every `pgvector`/`embedding` hit in `src/` is prose saying it is unscheduled |
| **`RECALL` and `LORE` blocks** | removed rather than deferred — nothing ever added one. Add them back *with the code that fills them* | `blocks.ts:12` is their epitaph |
| **Design screens D9, D10, D14** | **UNVERIFIABLE FROM THIS REPO** — the design source is not in the tree | — |

### Also open, smaller

- **Sixteen `check` modes now run in `test/all.ts`; `bench/` holds more harnesses than that.** Any
  new one should ship with a `check` mode and be listed there in the same commit.
- **`refreshManifest()` has 45 call sites, no debounce and no dedupe.** Each pays a full assemble
  (20.5 ms) plus a `/tokenize` round trip (**156 ms**, the largest app-side cost by far). Caching
  the count on the assembled prompt text would remove most of them.
- **`test/scope.ts`'s boot flake is diagnosed but not eliminated** — it was a 10 s bound under load,
  now 40 s. If it recurs, capture the child's stderr.
- **The plans' own last dead reference:** `bench/coherence.ts` is proposed and unbuilt. It is the
  judge pass for internal coherence, and it belongs to the first "Open work" row above.

---

## What was checked and is DONE — recorded once so nobody re-opens it

The six documents this replaces are mostly descriptions of work that shipped. These were verified
built on 2026-09-07 and are named here only so a reader of the archive does not mistake a plan for a
to-do: the end-chapter ritual and new-chapter setup; outfits, migrated into `addons` under the
`outfit` slot; interiority notes on a card; threads, rooms, states and connections (`entry_edges`,
`addonsOf`); chapter-end retirement (`retirable`); per-account prompt overrides (`prompt_overrides`);
character-by-prompt (`POST /api/invent`); the reroller, which rides `POST /api/generate` with
`regenerateOf` rather than a route of its own; the full-screen veil; ownership, scoping and the
allowlist; named blocks and declared transport; and full-text search, which landed 2026-09-06 and
was the last "missing" row in the old build state.

---

## Where the archived plans went, and why they were kept

`docs/archived/` — `PLAN-02`, `PLAN-03`, `PLAN-04`, `PLAN-06-MEMORY`, `PLAN-07-VEIL`,
`PLAN-08-THREADS`, `DECISIONS`. **Not deleted:** the code cites `PLAN-08` 73 times, `PLAN-06` 31,
`PLAN-02` 16, `PLAN-07` 16 and `PLAN-04` 6, in comments explaining why something is the way it is.
Deleting them turns those comments into dangling references. The rule is in `.claude/CLAUDE.md`:
archive rather than delete anything with citations — a rule broken the day before this file was
written, which is why it is stated here again.
