# Handoff — 2026-08-28, end of the surface-and-threads day

Branch `serial`, current, pushed, tree clean. `main` is 26+ commits behind and has not been
touched. Read `.claude/CLAUDE.md` first; this file is what a cold session needs on top of it.

## Where the work is

**PLAN-08 (`docs/plans/PLAN-08-THREADS.md`) is the live plan.** It absorbs issues #5 and #13 and
PLAN-06 §2e into one job, because they are one question: what is in a card, and what makes a piece
of it reach the model. Phases 1, 2 and 3 are done. Phase 4 has not started.

| phase | state |
|---|---|
| 1 · the flip + a probe | **done.** F38 is the number. Two changes shipped, two held with reasons. |
| 2 · the schema, once | **done.** `addons`, `entry_edges`, `retired_at_chapter`, `proposals.field`/`.activation`. |
| 3 · the context path | **done.** Addons and edges both reach the model; the cap is measured (F39). One thing left over, below. |
| 4 · chapter end | **the retirement half is done** (F40). Still open: #5's scan proposing new threads, clothing routed to outfits. |

### What Phase 3 closed, on 2026-08-28

1. **Directed edges are read.** A second pass in `buildContext` pulls a child in when its parent
   reached the prompt, or when the EDGE's own keys hit the window. The block's reason carries both
   the parent and the worth — `inherited 0.60 from Halsey` — because `canonRank` reads the reason,
   so an inherited pull sorts strictly below a direct keyword hit and above a sticky hold. That is
   where `confidence` gets spent. ONE HOP, with the ceiling written at the loop.
   **There is still no way to CREATE an edge from a surface**, and that is deliberate: two routes
   were written and then taken back out, because `test/web.ts` refuses a route no method in
   `web/api.js` names, and the method it would need has no caller until the Threads screen draws
   connections. `db.linkEntries` is how a test or a one-liner makes one today. The door belongs
   with the screen, in Phase 4.
2. **The cap is measured — F39, `bench/weight.ts`.** Canon peaks at **2% of its 45% ceiling** across
   the library, and a COUNCIL-04 #7 scene (46 cards at once) with five rooms on every one of them
   would want about **60%** of it. **Decision: eviction keeps dropping a whole card and does not
   learn to trim rooms first**, recorded as a `ponytail:` marker on `bodyOf` with its trigger —
   `bench/weight.ts` reporting the ceiling dropping a card at any position, or `fills` under ~50
   cards. Read the denominator before the number: **no book has a room yet**, so only the modelled
   column is evidence about this feature.

### The proposals queue stopped losing facts — 2026-08-28

**"Duplicate" meant SAME CARD, and it should have meant same PLACE.** At chapter end several passes
each have something to say about one person — her description from `remember`, a new fact from
`extract`, one of her rooms, that she is finished — and the queue called every one after the first a
duplicate and dropped it on a `false` nobody reads. Measured before the fix: `remember`'s state
landed and `extract`'s rewrite of the same character was **binned on every close where both spoke**.
Two rooms of one card did it to each other too, which the rooms feature inherited on the day it was
built.

`db.proposalTarget` is now the one definition of where accepting would write — `state` · `retire` ·
`string` · `room:<slot>` · `body` — and both the dedupe and the accept path ask it, so they cannot
drift. Two proposals collide only when accepting them would write over each other.

The correct collisions survive for free and are asserted: `new` and `changed` still collide, because
both write the body and they are one offer wearing two labels depending on whether `classify`
recognised the card; so do the same room twice and the same retirement twice, which is what the
dedupe was built for. The `retire`-only lane added earlier the same day is deleted — it fixed one
case of a general defect and left the rest standing.

### Phase 4, per-field updates — done 2026-08-28

**`proposals.field` is live on both ends.** It had been written since Phase 2 and read by nothing,
and nothing ever set it either — a dead column at both ends, so every accepted change rewrote the
WHOLE card body. That is the overwrite PLAN-08 exists to stop: she was loyal in chapter 2 and is not
by chapter 9, and a whole-body rewrite loses the arc that made the book worth reading.

- **`EXTRACT_SCHEMA` gained `field`**, an enum of every slot plus `none`. It is the THIRD place the
  slot list is written — a constrained decode must state its enum as a literal — so `test/db.ts`
  asserts it against `slots.ts`, the same way the partial index already is.
- **Three refusals in `extract()`, none of which the column could make for itself:** `none` means
  the card's own body; a room needs a card that ALREADY EXISTS to be a room of, so a field on a
  `new` proposal is dropped; and a slot the card's KIND does not have — `voice` on a place — is
  refused against `slotsFor`, because the enum cannot say "per kind".
- **Accepting writes an addon and leaves the body untouched.** An accepted room with no trigger
  words is switched ON, because a room that is filled in on the card and invisible to every prompt
  is the same darkness `src/import.ts:127` refuses for an entry.
- Five checks in `test/memory.ts`, each falsified.

**Not measured.** `EXTRACT` is a prompt with findings attached to it (F27) and this adds a paragraph
to it. Whether the model aims at the right room, or reaches for one when the body was the right
answer, has no number. That is a deliberate park, on Seth's call — build now, debug the logic later.

### Phase 4, the retirement half — done 2026-08-28

A chapter can finish a thread. `entries.retired_at_chapter` had a reader since Phase 2 and no
writer at all; it has `db.setRetired` now, with the way back in the same function (`null` lifts it,
which is `setPin`'s contract). Deliberately NOT a field on `upsertEntry`: that writes `last_editor`,
which arbitration keys on, so bringing a character back through the entry save would mark the card
human-edited.

- **The scan is a fourth worker at chapter end**, behind a free gate: `retirable()` in
  `src/context.ts` offers only cards the closing chapter NAMES, that carry no threshold already, and
  **never the point-of-view character** — `buildContext` applies its retirement branch before its
  `isPov` branch, so a retired persona card takes the protagonist out of every prompt with nothing
  on screen saying so.
- **Stored as `ch.index + 1`.** She dies DURING the chapter that just closed, so revising that
  chapter later must still have her in it. `remember` anchors states the same way.
- **The ritual is a screen** — a panel, not a full-screen surface, because `docs/checklist.md`
  question 2 reserves that decision. `V.ritualDone` is deleted: it was carried across exactly one
  refetch and dropped by every other, so the checklist vanished on any unrelated press.
- **F40 is the number, and it is a caution.** Recall 100%; false finishes **10%**, all of them one
  card — a place the prose calls closed. The `stories.direction` clause measured **exactly zero**
  across two placements. Read F40 before touching the prompt.
- **The browser harness ran.** `panels` 175 ok, `surfaces` 63 ok, **`ritual` 29 ok** after being
  rewritten for the two-press flow. It found a real defect that 295 node checks and 175 `panels`
  checks all missed, because none of them reload the page: `S.ritualOf` is session state, so a cold
  load at `#story/ritual` fell back to `currentChapter` — the NEW, empty chapter — and the screen
  reported that a chapter just summarised and read for facts had neither. The fallback is
  `wholeFrom`'s rule now: no session state and an empty current chapter means the one before it.
- **Still owed:** the retire round trip in `test/ui/panels.js` (press retire → manifest omits →
  press bring-back → it does not), and a rule about places, measured.

### The wardrobe stopped being two things — 2026-08-28

`worn()` and the `outfit` slot were a temporary pair and they are gone. PLAN-08 Phase 2 made
`addons` the class an outfit already was and copied every row across; the surface went on writing
the old `outfits` table, so there were two tables and two firing paths for one thing and
`src/context.ts` had to SKIP the `outfit` slot to keep from sending the coat twice.

- **`db.upsertOutfit` / `wearOutfit` / `delOutfit` / `outfitsOf` keep their names and write addons.**
  Deliberate: `src/import.ts` and three suites call them, and a rename would have meant finding
  every caller and getting them all right in one pass. One line each now.
- **One at a time is the slot's property and the database's job** — `outfit` is exclusive, so
  `setAddonActive` clears the siblings in the same transaction and the partial index refuses a
  second regardless. That is what `wearOutfit` did, generalised.
- **The outfit keeps its own sentence.** `[Aldis wears: wool, shiny cuffs]` says she has it ON;
  `[the grey coat: wool, shiny cuffs]` says only that the coat exists. It is the one slot where the
  room's NAME is not what the model needs to be told, and there is a check for it.
- **`POST /api/outfit`, `DELETE /api/outfit` and `POST /api/wear` are deleted**, with their three
  `web/api.js` methods. `test/web.ts` caught them going dead the moment the surface moved.
- **`src/import.ts` exported an empty wardrobe** for one commit, because it read the old table
  directly — an absent outfit looks exactly like a card that never had one. Fixed; the payload
  keeps its `outfits` shape so older export files still import.

**Still there:** the `outfits` TABLE, unwritten by anything. A `ponytail:` marker on `outfitsOf`
names the ceiling — a stale table a future import or export could resurrect into a second source of
truth — and the upgrade path: check `exportStory`, take a backup, then drop it.

### What Phase 3 still owes## What shipped today, in one line each

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
- **THE HARNESS'S OWN SILENCE IS AUDIBLE NOW.** `test/ui/run.sh` records every scenario it runs to
  `/tmp/anansi-ui-results.json` — merged per scenario, so `run.sh panels` does not erase what the
  others last said — and `test/web.ts` reads it. Three different answers on purpose: no file is a
  NOTE (a fresh clone has never run it), a stale scenario is a NOTE (a fact about this machine), and
  **a recorded death is a FAILURE**. `test/all.ts` now refuses to go green over a known corpse.
  Deliberately NOT a static check that every `data-*` in `test/ui/` exists in `web/app.js`: that is
  the obvious fix and it would not have caught this, because `data-act` DOES exist — it moved behind
  a press. The failure was ordering, not absence, and a guard that cannot fire reports perfection.
- **`buttons` and `handlers` are repaired: 0 → 17 ok and 1 → 43 ok, both 0 red.** They had been
  dying on their first click for weeks. One cause and one straggler: a card opens on its FACE now
  and both reached straight for form controls (commit `4ae74a9` taught `panels.js` and `phone.js`
  to press Edit; these two were missed) — and in the wardrobe, changing a card's kind saves and
  REPAINTS, and the repaint landed between filling the two boxes and pressing Add, so the press
  reached a real button holding empty fields and the only symptom was `an outfit can be added (0)`.
  Both files assert the face and then the form now, so the two views cannot quietly become one.
- **Seth runs the browser harness only when he asks for it.** Test what you touched. Be honest that
  a change to a shared view (the card's default, for instance) touches every scenario that opens a
  thread — three broke that way today and only a full pass found them.

## Numbers that override the docs

`docs/findings/P0-FINDINGS.md` beats `SPEC.md` and every plan. The four that matter most here:

- **F38** — the ledger's keyword path is NOT dead: 107 firings in 148 eligible entry-positions.
  PLAN-06 §2e's "best-tested dead code in the app" was true of a twelve-entry library on
  2026-08-27 and is not true now. §2e is marked superseded.
- **F39** — the cap does not bite. Canon peaks at 2% of its 45% ceiling; a 46-card COUNCIL-04 #7
  scene with five rooms on every card would want ~60%. Measured by `bench/weight.ts`, which walks
  every position through `view()`/`assemble()` against a COPY of the database — it never opens the
  live book. **Its denominator is the reading: no book has a room yet**, so the "as it stands"
  column is the shape before the feature and only the modelled column is evidence about it.
- **F40** — the finished-thread scan is right about deaths and wrong about a closed building, and
  the direction clause measures zero. It PROPOSES; nothing is written without a press. **Do not add
  an auto-accept.** `bench/retire.ts` re-runs it; its first three cases could not see the defect at
  all, which is why there is a fourth.
- **`bench/ledger-audit.ts` governs whether anything may be flipped to `triggered`**, and says
  existing rows may not: 1 in 12 would go dark and 2 more are "safe on the record, dark on the next
  call". `bench/fires.ts` is its per-position sibling and should be folded into it one day; it
  reports the denominator, which the older file does not.

## Open, and not being worked on

Issues #7, #9, #11, #12, #14. #9 (contradictions arriving late) is **downstream** of PLAN-08, not
beside it — the check reads the ledger, so fielded cards change its inputs and doing it first is
work thrown away. `serve.ts`'s three `ponytail:` markers are untouched: `:81` a reverse proxy breaks
the loopback rule OPEN, `:208` no backpressure now that a phone is on the tailnet, `:54` whois
cached per process. Twenty-eight `ponytail:` markers across the tree; the newest are the one-hop
bound on the inherited pull and the eviction decision F39 bought.

Parked with its reasoning in `docs/checklist.md`: attaching an image to an issue.

## Unverified by anyone but the harness

The talk-draft handoff (`web/app.js`, the "hand it to the composer" path) has no test — reaching it
needs a real generation. It is verified by reading only, and that is written down rather than hidden
inside a green count.
