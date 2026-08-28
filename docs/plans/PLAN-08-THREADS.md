# Plan 08 — threads: what a card is, and what makes a piece of it fire — 2026-08-28

Agreed with Seth on 2026-08-28. **Issues #5 and #13 and PLAN-06 §2e are one job**, because they are
one question asked three ways: *what is in a card, and what makes a piece of it reach the model.*
Split them and the fields get written twice.

## What is in, what is out

**In:** #5 (chapter-end scan proposes as well as rewrites; clothing becomes outfits rather than
prose; connected threads with a confidence score and their own trigger words) · #13 (a card is named
fields, not one description; fields update independently at chapter end) · PLAN-06 §2e (the flip:
nothing in the ledger can currently fire) · **the chapter-end half of #12**, because that is where
#5's scan has to live and a new ritual step with no screen is a step nobody takes.

**Out, deliberately:**

- **The fielded-card editor UI.** This session ends when the schema and the context path are right
  and the harness proves it. Redrawing the editor in the same pass is how a schema change ships
  half-done.
- **#9, contradictions arriving late.** The check reads the ledger. Fielded cards change its inputs,
  so doing #9 first is work thrown away. After, not beside.
- **#11 / #7's voice half.** Prompt work, not ledger work, and `docs/checklist.md` already rules it
  gets its own session with a probe first.
- **#12's story-start half.** Comes with the ritual work later; nothing here needs it.

## The order, and why the first phase is not the interesting one

### Phase 1 — the §2e flip, and a probe that proves firing happens

Everything below assumes the trigger path works. **It has never run.** §2e measured twelve entries
in the real library, twelve `always_on`, zero `triggered`, and every `keys` array the entry's own
title repeated. `fires()` at `src/context.ts:281` is exercised by six checks in `test/engine.ts` and
by nothing in production — the best-tested dead code in the app.

So: apply the rule this repo already has on one path (`src/import.ts:123` — an entry with no keys
becomes `always_on` rather than silently dead weight) at the three proposal sites
(`src/routes.ts:1049`, `:854`, `:926`), teach `EXTRACT`/`EXTRACT_SCHEMA` to return an activation and
say what a key is *for* (`src/prompts.ts:285`), and un-disable the trigger-words input at
`web/app.js:1657` so the keys a model proposed can be seen and edited.

**The probe is the deliverable, not the flip.** Per this project's own rule, a check that never fires
reports perfection. Phase 1 is done when there is a number for *how many generations could have
triggered an entry and did*, with the informative denominator — not when the code looks right.
Nothing in Phase 2 starts before that number is read.

### Phase 2 — the schema, once

Four additions. Two of them are less new than they look, and that is the good news.

1. **Fields.** A card becomes named fields per kind — a character has physical description,
   clothing, motivations, inner thoughts; a location has its own set; rules get more room. Half the
   groundwork is already in the table: `entries.field_editors` (`src/db.ts:215`) already stores
   *who last wrote each field* as `{field: 'human'|'model'}`, and the comment above it already
   argues why entry-level freeze rots — *"by chapter 30 the stale entries are exactly the
   protagonists you cared enough to touch."* The schema has been expecting this.

2. **Never overwrite. Append with a chapter number.** #5 asks what should be overwritten at chapter
   end; the answer is nothing. A story is change — she was loyal in chapter 2 and is not by chapter
   9 — and overwriting the motivation field destroys the arc that made the book worth reading and
   takes from the model the one thing it needs to write her turning. **`entry_states` already is
   this machinery**: `from_chapter`, `body`, `before_mode` (`hide` | `hint`), `label`
   (`src/db.ts:241`). A field and a state are the same thing; a field is a state with no chapter
   attached. Deciding that once makes #5's "should this be overwritten" stop being a judgement call.

3. **Edges are DIRECTED.** #5 wants a thing about a character connected to that character, inherited
   with a confidence score. Connection is not symmetric: her coat should arrive when she does, and
   **she must not arrive because somebody mentioned a coat**. Undirected edges reproduce COUNCIL-04
   #7's crowded scene — everything firing at once — by the back door. One column on the edge, parent
   pulls child or child pulls parent, costs nothing now and cannot be retrofitted over two hundred
   edges. The confidence score rides on the edge, and an inherited pull is worth less than a direct
   hit by construction.

4. **A thread can be finished.** Nothing in #5 or #13 ever retires anything. A dead character, a
   burned building, a rule that stopped applying keep firing forever, so the ledger's precision
   decays as the book grows — exactly when it is needed most. `retired_at_chapter` is one column and
   it turns "everything in here is still true" from an assumption into an assertion.

**And the thing neither issue says: who writes the trigger words.** #13 multiplies one card into six
fields, which is six times as many trigger words to author by hand, per card, forever. If the answer
is a writer typing keywords into six boxes, the feature dies of admin on card four. Anansi proposes
the words when she proposes the field, and they are editable — the same bargain as every other
proposal. Without that, #13 is a data model with no way to fill it. F27's "invented keys sometimes
repeat the title" is not sometimes, it is all of them, so this needs its own detector before it is
believed.

### Phase 3 — the context path

What fires, per field, through the directed edges, with sticky and the proper-noun exemption intact.
`render.ts` stays the only place block order becomes text. `buildContext` stays pure.

### Phase 4 — chapter end

#5's scan proposes new threads as well as rewriting; clothing lands as an outfit on the character
rather than as prose in her description; per-field updates instead of whole-body overwrites. The
ritual screen from #12 gets the step, or the step has nowhere to be.

## One correction to carry into the work

**None of this is a context-budget feature.** PLAN-06 measured the window as nearly empty — context
is not scarce, and P6's trigger has never fired. The win here is **precision**: the model is not told
about her coat when the scene is about her motive. If this ships justified as saving room, the first
honest measurement will show it saved nothing and the real gain will read as a failure.

## Critical files

`src/db.ts` (schema and migrations — `entries` :215, `entry_states` :241, `outfits` :324) ·
`src/context.ts` (`fires()` :281, the sticky walk, `wholeFrom` :435) · `src/prompts.ts` (`EXTRACT`
:285) · `src/routes.ts` (proposal sites :854, :926, :1049; ACCEPT :1336) · `src/render.ts` ·
`web/app.js` (entry editor, the trigger-words input :1657) · `test/engine.ts` (the six `fires()`
checks that already exist)

## Verification

Every phase leaves a runnable check, and each one gets falsified — broken on purpose, watched go red
on the specific assertion — before it is believed. Phase 1's probe reports a denominator. No phase
reports "fixed" where it can only report "under X%".
