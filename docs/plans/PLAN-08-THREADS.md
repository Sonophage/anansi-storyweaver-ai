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

**Rewritten 2026-08-28 after the probe ran. The premise below was wrong and is kept visible rather
than quietly replaced.** This section said the trigger path had never run — §2e's read of twelve
entries, twelve `always_on`, zero `triggered`, `fires()` as "the best-tested dead code in the app."
That was true of that library on that day. **F38 measured 107 firings in 148 eligible chances.** The
ACCEPT path at `src/routes.ts:1390` lands non-characters `triggered` and enough have been accepted
since. The dead-code framing must not be repeated without re-running `bench/ledger-audit.ts` and
`bench/fires.ts`.

**What the probes changed about the work:**

- **The guard §2e asks for is already built**, and it is stronger than §2e describes:
  `src/db.ts:896-899` refuses to store `triggered` with no keys on `upsertEntry`, which is the write
  path every route reaches. It stops NEW darkness. It deliberately does not migrate old rows.
- **Existing rows must not be flipped.** `bench/ledger-audit.ts` — which already existed and which
  `bench/fires.ts` should have been part of — reports 1 of 12 entries would go dark, and 2 more are
  *"safe on the record, dark on the next call"*. Four of its eleven "safe" verdicts rest on stories
  with fewer than four selected passages. That is not evidence for a migration.
- **A proposal cannot carry an activation yet.** §2e's "honour a model's explicit `always_on`"
  assumes a field that does not exist: `proposals` (`src/db.ts:266`) has `entry_type` and `keys` and
  no `activation`. Adding it is a migration and belongs in Phase 2, not here.

**So Phase 1 is the two changes the evidence does support, and they are both about making keys
visible before anything fires on them:**

1. **Done.** The trigger-words input is no longer disabled on an always-on entry (`web/app.js`). It
   was greyed out on most entries in the library, so the one screen that could show F27's defect —
   every proposed key is the entry's own title repeated — was the screen that hid it, and there was
   no way to author keys *before* flipping the chip, which is the only safe order.
2. **Done.** `EXTRACT` (`src/prompts.ts`) now says what a keyword is *for*: a word that actually
   appears in the prose, which is what makes the entry reach the model later, and repeating the
   title back buys nothing. `EXTRACT_SCHEMA` is unchanged — an `activation` field with nowhere to
   land would be a constrained decode producing a value the accept path throws away.

**Held, with the reason:** flipping characters-with-keys to `triggered`. It needs the proposals
column from Phase 2 and a re-run of `ledger-audit` against a library where keys are authored rather
than title-repeated. Today's numbers describe keys nobody wrote.

### Phase 2 — the schema, once

**The shape, concretely.** Rewritten 2026-08-28 on Seth's call: *"all these additions outside of
the body should be the same class as outfits are, i.e. addons, and several can be triggered on at a
time for specific ones."* The first draft made a field a row in `entry_states`, one per name. His is
better and the reason is that a card does not have *one* relationship — it has three, and each wants
its own trigger words. A field-as-blob can only arrive whole.

**One table, `addons`, and `outfits` migrates into it as a slot.** Not a rename of `outfits` — the
name would lie forever on a table holding voices and relationships — and not a second table beside
it, which is two firing paths to keep in step.

```sql
CREATE TABLE addons (
  id TEXT PRIMARY KEY,
  story_id TEXT NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  entry_id TEXT REFERENCES entries(id) ON DELETE CASCADE,  -- null = the story's own
  slot TEXT NOT NULL,              -- outfit | appearance | interiority | relationships | voice | …
  name TEXT NOT NULL,              -- what it is called on the screen
  body TEXT NOT NULL,              -- what the model reads
  keys TEXT DEFAULT '[]',          -- it can arrive on its own, like an entry
  active INTEGER DEFAULT 0,        -- the writer pinned it on
  from_chapter INTEGER,            -- when it became true
  retired_at_chapter INTEGER,
  created_at INTEGER NOT NULL);
```

**The slots, per kind.** Named in one module, never free text — the `blocks.ts` rule, and
`entries.field_editors` already keys provenance by name so the two lists must be one list.

| kind | body | addon slots |
|---|---|---|
| character | the spine, always sent | `appearance`* · `outfit`* · `interiority` · `relationships` · `voice`* |
| lore / place | the spine | `appearance`* · `atmosphere` · `who_is_here` · `history` |
| item | the spine | `appearance`* · `provenance` · `what_it_does` |
| rule | the spine | `scope` · `consequences` |

`*` = **exclusive**: one at a time, the way an outfit already is. `wearOutfit` (`src/db.ts:1001`)
already enforces that in a transaction — clear all for the entry, set one — and generalising it is
one `AND slot = ?` in the `UPDATE`. The rest accumulate: three relationships are three rows, each
firing on its own words. Exclusivity is a property of the SLOT and it lives in the database, not on
the screen.

`motivations` is not in the list. Seth named four for a character and it was not one of them;
`interiority` is doing that work.

**Two ways in, and they are a UNION — not a new rule.** An addon reaches the model when its entry
does **and** (`active` is set **or** its `keys` fire). That is exactly what an entry already does
with `force_in` or a keyword (`src/context.ts:439-443`), so there is no second firing semantics to
learn or to keep in step. `active` means *the writer pinned it on*; keys mean *it can arrive on its
own*. Conflating them gives four states and nobody can say what reached the model.

**Strings get this for free, and that is the strongest argument for the shape.** `strings`
(`src/db.ts:255`) already carries `body`, `from_chapter` and `summoned INTEGER DEFAULT 0` — *"only a
summoned string reaches the prompt"*. That is `active` with a different name and no keys, so today an
open promise reaches the model only if the writer remembers to summon it by hand. As an addon with
`entry_id` null it keeps the manual switch **and** gains trigger words, so a promise can arrive when
the prose walks past it. Whether the `strings` table folds in or just shares the firing code is a
Phase 2 call; the win is the same either way and the code-sharing version is smaller.

**`from_chapter` stays, and it is what makes the arc survive.** An exclusive slot plus
`from_chapter` is a timeline — appearance at chapter 1, appearance at chapter 9, newest at or before
the current chapter wins, which is `resolveBody`'s existing logic pointed at a slot. Plural slots
just accumulate. This is the "never overwrite, append with a chapter number" decision from the top
of this plan, and dropping it to match `outfits` — which has no `from_chapter` — is the one way this
shape could quietly lose it.

**Edges, directed, in a small new table:**

```sql
CREATE TABLE entry_edges (
  id TEXT PRIMARY KEY, story_id TEXT NOT NULL, parent_id TEXT NOT NULL, child_id TEXT NOT NULL,
  confidence REAL DEFAULT 1.0,   -- what an inherited pull is worth against a direct hit
  keys TEXT DEFAULT '[]',        -- the edge's own trigger words, per #5
  created_at INTEGER NOT NULL);
```

**Parent pulls child and never the reverse.** Her coat arrives when she does; she does not arrive
because somebody said "coat". Undirected edges rebuild COUNCIL-04 #7's crowded scene through the
back door, and the direction cannot be recovered once two hundred edges exist.

**Retirement:** `retired_at_chapter` on `entries` as well as on `addons` — a dead character, a
burned building, a rule that stopped applying. Without it the ledger's precision decays as the book
grows, which is exactly when it is needed most.

**Proposals learn to aim at a slot:** `proposals` (`src/db.ts:266`) needs `slot TEXT` and
`activation TEXT` — the first so chapter end can propose one relationship rather than a whole new
body, the second because §2e's *"honour a model's explicit activation"* has nowhere to land today.

**A cap, or the crowded scene comes back — and this shape makes that risk BIGGER, not smaller.**
Today one entry is one block. After, one entry is one block plus N addons, and N is unbounded
because plural slots accumulate. COUNCIL-04 #7 was 46 entries firing at once; this is the same
failure with a finer grain. `CANON_CAP_FRAC` exists and whether it is enough is a measurement, not
an opinion: Phase 3 does not close until `bench/fires.ts` reports the per-position numbers again
with addons switched on, and the eviction order has to say what it drops first — a whole entry, or
its addons before its spine.

**What this does NOT change:** `entries.body`, `keys`, `activation`, `sticky_for`, `proper_nouns`
and `field_editors` keep their meaning. `entry_states` keeps its. Nothing above is a rewrite of the
engine; it is one new table, one migration of `outfits` into it, two small columns on `proposals`,
one column on `entries`, and one names-only module.



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
