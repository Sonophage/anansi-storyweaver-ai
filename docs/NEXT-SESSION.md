# Next session — the state to argue from

> **SUPERSEDED IN PART, 2026-08-28.** Items 1-4 of §4's build order are done, and §4's own framing
> of item 2 was wrong in a way worth keeping: 2c turned out to be already built, 2e is one guard
> rather than three, and 2a's answer was that the meter should not have been reading the estimator
> at all. `docs/findings/BUILD-STATE.md` §7 is the current state; read it first and treat everything
> below as the argument that produced it rather than as today's list.

Written 2026-08-28, at the end of a long day. Everything here was read from source or measured, not
recalled. It exists so the first thing we do next time is **decide priority**, not rediscover state.

Both harnesses green at `f4fd312`: `test/all.ts` all suites, `test/ui/run.sh` **twelve scenarios,
0 red** (`modes` 58, up from 49 this morning).

---

## 1. Read this before anything else

**`docs/findings/BUILD-STATE.md` is a day stale and knows it.** Its own §6 header says an
append-only document reports the past as the present, and it has caught itself doing that four
times. It has no §7, so roughly thirty features from 2026-08-27/28 are absent from it — the veil,
the seam pin, the expanding composer, contradiction muting, the hardware-keyboard preference, the
daily book export, F37. **Nothing below is trustworthy priority advice until that document is
re-audited**, which is why it is item 1 of the build order.

`checklist.md` stayed accurate over the same period because it is rewritten rather than extended.
That difference is the lesson, not the drift.

---

## 2. The debt in `.claude/CLAUDE.md`, checked

The file's three "where the truth lives" pointers were verified this session:

| claim | state |
|---|---|
| `P0-FINDINGS.md` overrides SPEC and the plans | true, and F37 was added and then **reversed by its own control arm** |
| `BUILD-STATE.md` is audited against source | **stale** — see §1 |
| the ledger is twenty-one markers | **was wrong, now corrected to twenty-four** |

Two rules in that file earned their keep today and are worth re-reading before touching prompts:

- *Falsify the test, not just the code.* Four checks added today were broken on purpose and watched
  go red. The composer-focus check is the sharpest example: written only for the "typed" case it
  would have stayed green through the entire bug, because only the **empty** box regressed.
- *A zero is not an absence.* The contraction probe printed every skipped trial rather than folding
  it into a denominator, which is the only reason a wrong response key read as a bug instead of as
  "0%, finding confirmed".

**Added to `CLAUDE.md` this session:** a story may pin its own model in `stories.model`, and one in
the live library still points at a pre-rename preset. And the register rule from F37 — the voice
field already outranks everything, but only if it is written like an instruction; do **not** put
register rules in SYSTEM, where a clause measured 98.0 against 98.0 and was deleted.

---

## 3. The ponytail ledger, audited

**Twenty-four markers**, by file: `routes.ts` 6, `db.ts` 6, `app.js` 3, `context.ts` 3, `serve.ts` 3,
and one each in `prompts.ts`, `app.html`, `bench/ledger-audit.ts`.

Two were spot-checked against source and both are still true. `db.ts:863` claims a rejected take is
recorded and shown but never sent to the model; confirmed by grepping the whole prompt path
(`context.ts`, `render.ts`, `prompts.ts`, `story.ts`) rather than by believing its own comment.
`app.js:3375` claims two touch guards have no independent check; still accurate.

No fake debt found. The ledger is in better health than the build-state document.

**The three sharpest, and they are all in `serve.ts`:**

- `:208` — no backpressure, on a server that now fronts a real tailnet with a second writer on it.
- `:81` — a rule a reverse proxy would break, and it would break it **OPEN**. That is an
  authentication failure mode, not a performance one.
- `:54` — the whois hit is cached for the life of the process and keyed on IP.

These are not on any build list. They are the only markers whose failure mode is a security or
availability one rather than a quality one, and that is worth weighing against the correctness work
below.

---

## 4. The build order I would argue for

1. ~~**Re-audit `BUILD-STATE.md`.**~~ **Done** — §7, the fifth pass. It also found `checklist.md`
   drifting, so the fourth pass's "a rewritten document does not drift" did not survive contact.
2. ~~**PLAN-06 2f — the key parser.**~~ **Done.** One `keysOf` in `db.ts` with SPEC §7.1's 2-32
   bound and a cap parameter. It also surfaced a second defect nobody had listed: `fromCard` set a
   lorebook entry's activation from `constant` alone, so an entry whose keys did not survive
   imported as triggered-and-unfireable.
3. ~~**PLAN-06 2d — SYSTEM missing from `manifest.totals.used`.**~~ **Done**, off the budget rather
   than into the blocks. And "wrong by a fixed amount" was wrong: 2a ran the other way and partly
   cancelled it, which is why the bar looked roughly right.
4. ~~**PLAN-06 2a — the token estimator running 30–48% high.**~~ **Done, and it was 59%.**
   `bench/drift.ts` measured it over 147 logged calls. The meter no longer uses the estimator at
   all — `/api/manifest` had been returning the exact count all along and nothing read it.
5. **PLAN-06 2e — the ledger audit.** Ungated now that 2f has landed, and **the probe has run**:
   1 of 7 judgeable entries would go dark, 2 more are dark on the live window. So the flip is not
   supported; a guard on new writes is, and it belongs in `upsertEntry` with `keysOf`. One
   conflict to settle first — `app.js:3964` uses triggered-with-no-keys deliberately.
6. **F36's structural half.** A passage that quotes canon while contradicting *itself* passes the
   checker perfectly, because the checker compares prose against canon and never against the passage.
   No marker anywhere. New work rather than repair.
7. **Activation depth**, then **the budget engine**. The budget engine is still correctly gated —
   nothing has overflowed since the chapter window landed, and PLAN-02 §7.2's trigger has not fired.

Left off deliberately: `delBranch` needs a screen (the last honest `DEFERRED` entry), the service
worker, design screens D9/D10/D14, and `bench/drift.ts`. None cost anything today.

**The argument to have:** §3's `serve.ts` markers against §4's items 2–4. The correctness work fixes
numbers Seth reads; the `serve.ts` work fixes a door that opens the wrong way when something else
changes. They are not comparable on effort, and the security one has no deadline until Kia is
actually writing over the tailnet — at which point it has already happened.

---

## 5. Two live-database facts that are not code

- **`The Shadow's Debt` is pinned to `rp-t-glm47flash-h`**, a pre-rename preset. The router answers
  `400 model not found`. That story cannot generate until it is repointed.
- **Three of five stories have no register rule in their voice**, so they sit at the ~23% baseline
  by default. `DEFAULT_VOICE` says nothing about contractions and was deliberately left alone —
  changing it imposes a register on every new book, and it is Seth's own text.
