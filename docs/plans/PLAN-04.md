# Plan 04 — characters and chapters

> **STATUS: PROPOSAL, not agreed.** Written for the design conversation on 2026-08-23 against
> `bugs.md`. Nothing here is built. Where it recommends measuring before building, that is not
> hedging — F10 shipped a plausible prompt fix that made things worse, and F12 declared a defect
> fixed on a small-sample zero.

Six things from `bugs.md`: a character-creation skill, a reroller, costumes, interiority and
threads, the end-chapter ritual, and the new-chapter setup page.

---

## The finding that shapes this

**The chapter ritual needs no new engine.** All three things you want on the new-chapter page
already have a mechanism, and each already reaches the model:

| what you asked for | what it already is | where it lands in the prompt |
|---|---|---|
| "the prompt for what happens next" | `chapters.authors_note` | DIRECTIVE, as `[This chapter must end with: …]` |
| "whose in it" | `chapter_pins` with `force_in` | CANON-TRIGGERED, reason `pinned in` |
| "where it takes place" | a lore entry pinned in, or `stories.setting` | CANON-TRIGGERED, or SPINE |

So the ritual is **a sequence and a screen**, not a feature. That makes it the cheapest item on
the list and the one I would do first.

The character items are the opposite: three of the four want new fields, and one wants a new
structured role.

---

## 1. End-chapter ritual

Today: `End chapter here` closes the chapter and opens the next. Summarise and extraction are
separate buttons you have to remember.

Proposed: one action that runs the three steps in order and shows each one.

1. **Summarise the chapter.** Already built. Feeds EARLIER on every later call.
2. **Read it for facts.** Already built — extraction proposes new, changed and conflicting
   entries. **Nothing is accepted automatically**, and that stays true: SPEC §8.2, and it is the
   rule that makes the ledger trustworthy.
3. **Open the next chapter's setup.**

The one thing to decide is what happens if you dismiss the queue without deciding. My position:
the chapter still closes. A ritual that can trap you in it is a ritual you learn to avoid.

**Warning worth stating before this ships.** F18 measured chapter summaries coming back at
1,000–1,300 characters of analysis where ~180 words of story bible was asked for. Making the
summary automatic on every chapter close makes that defect *routine* rather than occasional, and
EARLIER carries it into every subsequent call. **Fix F18 first, or the ritual industrialises the
bug.**

---

## 2. New-chapter setup page

Three fields, all writing to things that exist:

- **What happens next** → the chapter's author's note. It is a destination for the chapter, not a
  line of prose, and it already rides in DIRECTIVE near the generation point.
- **Who is in it** → tick characters from the cast; each becomes a `force_in` pin for that
  chapter. That is exactly what pins are for: PLAN-03 records the correction that pins are *not*
  a fix for canon drift, they are for "a fact that matters in a scene where nobody says its
  keyword". A character present but unnamed is that case precisely.
- **Where** → pick a lore or item entry to pin in, or leave it on the story's setting.

**Cost, stated plainly.** Four pinned characters and a place put their full canon in every call of
that chapter, whether or not anyone names them. At the current slot that is affordable — canon is
capped at 45% of 46,146 tokens and the fixture uses about 300. On a forty-entry ledger it will not
be, and the honest answer then is that the budget engine (P6) exists for exactly this.

**Skippable or mandatory?** I would make it skippable with a visible "not set yet" state. A blank
author's note is a real choice — some chapters are written to find out what happens.

---

## 3. Costume, and what it really is

You said: *"a costume and a selector for it so that way things like armor can be taken on or off
without it being an issue when prompting."*

The issue is precise. A character entry holds permanent facts. If it says *wears plate armour*
then that is true on every call, including the scene where she is in a shift — and canon fighting
the scene is the one failure mode this project has actually measured. F9 put it at 4% of passages
that mention the thing in question.

SPEC §7.1 already argues that a permanent body must not hold temporal facts. Costume is that
argument arriving in practice.

**Two shapes, and they are genuinely different:**

**A. One "right now" line per character.** The entry keeps permanent traits; a second short line
holds what is currently true, and you change it when it changes.

```
[Ilva Marren: 34, envoy without a house, limps on the left]
[Ilva, right now: in the plate she took from the hall. Bare-headed.]
```

Cheap — one column, one field, one more rendered line. It generalises past clothing to anything
temporary: wounded, drunk, disguised, carrying the key. And it is the spec's own permanent-versus-
temporal split, implemented.

Its weakness: nothing reminds you to change it, and a stale "right now" is worse than none.
Mitigation: show it on the story screen where you can see it while writing, and surface it in the
chapter ritual for review.

**B. Named outfits you switch between.** "Court dress", "Travelling leathers", "Plate". Each is a
stored body; a selector picks the active one.

More machinery — a table, or states keyed on something other than chapter. Better if you have
recurring, named looks you switch back and forth. Worse if the temporary state is usually
one-off ("soaked through", "wearing Marek's coat").

**My recommendation: A.** It is a third of the work, covers more than costume, and matches an
argument the spec already makes. B is the right answer only if you actually think in named
outfits — which is a question about how you write, not about the engine.

**Not to be modelled at all:** whether the armour is *on* in this paragraph. That is prose, and
F17 measured the model tracking a physical state across 17 informative generations without one
violation, when the state was in canon. Give it the state; do not give it a wardrobe.

---

## 4. Interiority and threads

You asked earlier for *"per character interiority… small notes that can be keyword triggered"*,
and here for *"internal thoughts of the characters and their threads to the main character or
others in the scene."*

**Interiority.** One field, rendered only when the entry fires — which is what CANON-TRIGGERED
already does — and marked as interior so it is not narrated:

```
[Ilva, interior: believes the debt is hers to pay. Has not said so.]
```

**This one needs measuring before it ships.** The whole risk is the model taking an interior note
and writing it as narration — *"Ilva believed the debt was hers to pay"* — which turns a private
thought into exposition and ruins the effect you want it for. F17's harness tests exactly this
shape of thing: put an interior fact in canon, generate thirty times, and count how often the
narration states it outright. If it leaks badly, the fix is prompt wording, and F10 is the warning
that the first plausible wording may make it worse.

**Threads.** SPEC §15.2 already covers this and says the right shape is an edge table, deferred:
*"at thirty entries it is not yet needed."* I agree with the deferral and would start with a text
field:

```
[Ilva ↔ Marek: owes him eleven crowns. Believes he knew her mother.]
```

The edge table earns its place when you want a *transitive* pull — naming "the Council of Five"
fetching all five member sheets. A text field cannot do that. Nothing you have described needs it
yet.

---

## 5. Character creation by prompt, and the reroller

`spark` already turns a sentence into a whole story with a cast. A single-character version is the
same machinery with a smaller schema: a sentence in, one entry out — name, type, body, keywords,
and now interiority.

**Bound the output.** F18 measured two structured roles overrunning their stated length by three
to twenty times, because the length was asked for in prose and nothing enforced it. A character
role that returns four hundred words of body is a character that eats the canon cap. Put
`maxLength` in the schema, not a word count in the prompt.

**The reroller is already half-built.** `entry_revisions` stores per-field history with
provenance, and the entry editor already has a restore path. So "reroll" is: call the role again,
write the new body as a revision, and let you flip between takes — the same shape as passage
variants, which you already use. No new storage.

---

## What I would do, in order

1. **Fix F18** — bound `check`'s reason and `summary`'s length in the schemas, and measure that
   bounding them costs nothing. Everything else here makes F18 worse if it lands first.
2. **The chapter ritual and setup page.** No new engine, and it is the thing you will touch every
   chapter.
3. **"Right now" per character.** One column, big payoff, and it is the spec's own argument.
4. **Interiority — measure first, then ship or drop.** One probe, thirty generations.
5. **Character-by-prompt and the reroller.** New role, bounded, reusing revisions.
6. **Threads as a text field.** The edge table stays deferred until a ledger actually needs it.

---

## What I need from you

1. **Costume: shape A or B?** One "right now" line, or named outfits you switch between? This is a
   question about how you write, and it changes the schema.
2. **Is the chapter setup page skippable?** I would make it skippable. Say if it should block.
3. **Should interiority reach the model at all**, or is it a note for you? If it reaches the model
   it needs the leak measurement first.
4. **Direct mode.** You wrote that it *"should be a prompt where whatever is entered is used for
   the ai to write it into cannon as a prompt."* Today it writes prose from your instruction and
   the instruction is not kept. Did you mean the instruction should become a canon entry, or that
   it should be recorded against the passage? I did not change it on a guess.
