# What is open — after a day's work on 2026-08-26

## ⇢ CARRIED OFF `SPEC.md` WHEN IT WAS ARCHIVED, 2026-09-03

Four of that document's §15 gaps were still open when it moved to `docs/archived/`. They are here so
archiving did not quietly close them. None is urgent and none is forgotten.

1. **The golden fixture (§15.1).** Roughly fifteen tuned constants are guesses that happen to be
   written down, and stay unfalsifiable until a fixture with planted contradictions runs against
   the checker. Some of this arrived anyway: F17's probes ship 22 synthetic cases asserting both
   directions, which is the same idea at one check's scale.
2. **The intra-ledger contradiction check (§15.3).** Two threads that disagree with *each other*
   still go unnoticed — the checker reads prose against canon, never canon against canon. Cheap to
   add on the same `check` role.
3. **The cost ceiling (§15.5).** `generations` records enough to enforce a per-writer cap and
   nothing enforces one. Local inference makes this a time budget rather than a money one.
4. **Resumable streams (§15.7).** A reload mid-passage loses the in-flight generation. The veil
   covers the wait; it does not survive a refresh.

*(§15.2, "no relations graph", is NOT here: it is built. `entry_edges` exists, `context.ts` reads
it, and a card's connections have a form.)*


## ⇢ ANSWERED 2026-08-28, AND WHAT IS LEFT TO DECIDE

Seven questions were asked here overnight. **Five are answered and closed.** What is below them is
the standing record and is unchanged.

**Decided by Seth:**

- **Issue #5 absorbs PLAN-06 §2e** rather than sitting beside it. Connected threads with a
  confidence score and their own trigger words *is* the activation work, arriving from the writer's
  side. §2e stops being its own item.
- **Issue #7 splits.** The `@`-autocomplete for summoning threads, stories and chapters gets built
  now. **Anansi's voice gets its own session** — a probe with a denominator first, then a change.
  Not a prompt edit taken on the way past.
- **The full-screen veil with Stop inside is its own session**, and the theme menu going full screen
  goes with it: same shape, same decision about what a full-screen surface covers.
- **The tray and the veil are one job.** Four surfaces (`#dock.big`, `#appearance`, `#rail`, the
  tray sheet) have four stacking rules and no shared owner. That gets decided once.
- **The context meter's colours stay as they are.** Three adjacent pairs are separated by hue alone
  — `CANON-TRIGGERED`/`STRING` at 1.00:1, `STRING`/`EARLIER` at 1.14:1, `EARLIER`/`PROSE` at
  1.06:1. It is a personal app and hue is enough. The check still refuses two adjacent segments
  being *identical*, and nothing else.
- **Issues #4 and #6 confirmed fixed** on his own screen. #6 is closed on the report as well as in
  the code.

**Still open, and these are the real questions now:**

1. **Where does the `@`-autocomplete look?** Threads, stories and chapters are three scopes. Inside
   a story, does `@` reach other books or only this one?
2. **What does a full-screen surface cover?** #3 says the header — book and chapter name — must
   stay, with the composer filling everything below. Is that true of the *theme menu* and the *menu*
   too, or only the composer? The answer decides one rule or three.
3. **The checklist itself.** This file is doing three jobs — open work, a walk list, and a record of
   what was built. Proposal: it keeps only what is **open and undecided**, capped at one screen;
   everything historical moves to `BUILD-STATE.md`, which is already the audited record. Agreed
   before the next session, not during it.

**Two books for testing, both in the library:**

- **`Test`** (`s-bcb217a0`) — the one to break. Everything below is true of it.
- **`The Proving Ground`** (`s-ebce7b7c`) — the same book, Seth's to keep and write in.

Noir, night porter, a ledger with pages cut out of it. Three passages, four ledger entries, a voice
field carrying an F37-style register rule on its own line, a direction set. **Three of its four
entries are `triggered` with keys that actually appear in the prose** — which makes it the first
book in the library that can exercise `CANON-TRIGGERED` at all. `bench/utilisation.ts` measured that
block sent in **zero of 61 calls** because every entry everywhere was `always_on` with keys that
echoed their own title.

**READ 2026-08-30, and the answer is split. Was: "to be CHECKED — counted, never read."**

- **The spark wizard's model calls.** The question was whether a second press during a spark sends a
  second request. It was asked of four handlers — `spark`, `spreroll`, `spreview`, `acceptSpark` —
  and reading them gives two different answers.

  **`spreroll` and `spreview` already guard**, through `S.spark.sparking` and `S.spark.reviewing`,
  as does `spwritecast`, which was not on the list. They use state rather than `whileWorking` and
  that is correct here: this panel repaints on every call, so a `disabled` attribute written by
  `whileWorking` would be thrown away by the next render. `test/web.ts` now asserts the idiom for
  all five wizard calls — the three above plus `sprecast` and `spstyle`, added #28 — and it looks
  for the early RETURN, not for the flag. The first version of that check searched the handler for
  `S.spark.<flag>` and passed with the guard deleted, because the line that SETS the flag matched
  just as well. Falsified by unwrapping each one.

  **`spark` and `acceptSpark` did not guard, and it was a live defect. FIXED 2026-08-30.** Neither
  had any re-entry check. A double press on "Accept and start writing" sent two `POST /api/stories`
  and **created two books** — silently, same title, same cast, and the shelf was where you found
  out. A double press on "Spark a skeleton" sent two model calls.

  Both go through `whileWorking` now, not a state flag, because neither screen repaints mid-call —
  and they are in `test/web.ts`'s `guarded` list, which they were kept out of while the defect
  stood. Accept carries a SECOND guard as well, `S.spark.accepting`: `whileWorking` releases the
  button when `createStory` answers, and that handler runs on through a saveStory, a copyEntry per
  picked thread, and loadLibrary/openStory — a press landing in that window would have started a
  second create with the button no longer busy.

  **Proved by pressing, not only by grep.** `test/ui/wizard.js` dispatches two synchronous clicks at
  each button and asserts one request and ONE BOOK. Falsified against the pre-fix code: 2 and 2.

---

**Open bugs, scoped and not yet built** — see `docs/archived/PLAN-07-VEIL.md` for the veil half:

- **The hardware-keyboard toggle** is still in the themes footer and belongs only in the UI tab.
- **A regression:** with it on, the input box moves again. It used to hold still, because there is
  no on-screen keyboard to make room for.
- **Issue #2, diagnosed at last.** On a passage the model just wrote, the tray opens *under its own
  blur*. `#col .block.newest` carries `animation:rise … both`, and a filled transform animation
  makes that block a stacking context — which caps the sheet's z-index inside it, so `#scrim` at 31
  paints over a sheet at 32. `app.html:568-575` records this exact bug from a previous round and the
  fix that was supposed to close it. It is back, and only on a passage that has just *arrived*,
  which is the case no fixture had.
- **Issue #3, the rest.** The expand button's box is 44px but its glyph is still 17px; the expanded
  composer's ground is not opaque, so prose reads through it; and the header should stay above it.

---

---

> **Cleared against source on 2026-08-28.** Everything struck through below was checked in the code,
> not remembered, and the file line is named. Nothing was deleted: what was open and is now built
> stays visible, because the reason a thing sat here outlives it.

**Round five passed clean**, and then eleven things landed on top of it. So this file is two things:
the standing record of what is open, and — under **Built since round five** — the list the next walk
is made of. None of it has been used by the person it is for.

What is left of round four is one item and a shelved one. The rest of what is open is decisions
rather than work, and they are gathered below.

One thing a clean pass did NOT clear, because the walk never asked for it: **the three features
round four reported as missing and which exist end to end.** Nothing in round five sent you looking
for them, so a green pass says nothing about whether they are findable now. That is a walk item for
the next round, not a fix.

```
https://hestia.tempel-discus.ts.net:5174        the only URL that works
systemctl --user status anansi                  it starts itself, and on boot
node --experimental-strip-types test/all.ts     eleven suites, no model — the harness prints its own total
test/ui/run.sh                                  fourteen scenarios, no model — it prints its own total
                                                (both read out of the harnesses 2026-08-28)
```

---

## Still open

**COUNCIL-04 is closed** — all eight findings and all seven of its smaller items. Nothing from the
original review is outstanding. What is left is of three kinds.

### Landed 2026-08-27, second half — memory before compaction

Done in the order agreed with Seth: make the ledger real *before* the prose window is cut, not
after. The measurement that set the order, read off `anansi.db`: the prompt is **8,676 of 46,446
tokens**, canon **3.4%** of it, **87% of the slot unused** — and **twelve entries in the whole
database, every one `always_on`, eleven with `keys` that are just the entry's own title.** Context
was never scarce. The tier meant to catch the prose was not there to catch it.

- **A chapter reads itself when it closes.** `extract` fires on close on the same terms
  `summarise` and `remember` already do. Proposals, never writes. The ledger is the only tier that
  survives compaction, so leaving it on a button left the memory optional — the argument already
  written above `summarise` at `routes.ts:571`, applied word for word. **The surface had been
  promising this all along** (`app.js:1015`, `:1043`); the code now matches the copy.
- **Extraction reads narration only.** PLAN-06 §2c. `remember` has stripped dialogue since it was
  written and this read `p.body` raw, while `EXTRACT`'s own prompt says a character being wrong is
  not a fact. Mattered less behind a button; it runs every chapter now.
- **The prose window closes at the chapter boundary**, with the seam as the exception: an empty
  chapter still sees the one before it, because otherwise every chapter opens from a summary with
  no sentence in front of it. The scene break is excluded from that count and has its own case.
- **`keep_whole` has a door** — a toggle on each summary in the Chapter panel. Honoured by the
  engine since it was written, reachable from nowhere. Underneath it, `updateChapter` wrote the
  column unconditionally while every caller sends only a title and a note, so renaming a chapter
  switched pull-back off. Fixed with the idiom `updateStory` has always had.
- **Per-story look** — theme, font, prose size, UI scale — over a writer default that lives on the
  server rather than in one browser.
- **Stop** reaches the model, not only the page.
- **One model per writer.** Switching your default releases the one you were on. The guard is the
  feature, because the box is shared: never the boot default, never another writer's, never one a
  book is pinned to, never one with a call in flight. **The router has had an unload endpoint since
  build b10566** — `llama.ts` and the Preferences hint both said it did not.
- **A chapter can wear the book's cover** as a plate at its head. Off by default on every book.
- **The doorless-route guard runs both ways**, and `POST /api/remember` has a door at last.
- **`handlers` drifting 39 to 40 is diagnosed**, and it was never a flake: its Accept block ran off
  a live `/api/extract`, so a busy router meant one assertion silently did not run. The fixture
  plants a proposal now and the skip is a red.

**Owed a walk.** None of it has been used by the person it is for.

### Still not measured, and named so it is not mistaken for done

The window change makes the prompt smaller in a prompt that had room to spare. What it buys is
what the model *leans on*, and nothing yet says whether the ledger it now leans on does any work:
canon is 3.4% of the prompt and `CANON-TRIGGERED` contributed zero blocks on the last call, because
nothing in the database can fire. **Both instruments have now been run, 2026-08-28.**

`bench/ledger-audit.ts`: of the 7 entries the prose can answer for, **1 would go dark** on a flip to
`triggered`, **2 more of the 6 "safe" fired only in the past** and not on the live window, and 4 of
those 6 rest on a story holding fewer than four selected passages. So the flip of what is already
there is not supported; a guard on new writes is, and it is built.

`bench/utilisation.ts`, over the 61 generations that can be scored: **PROSE is 59.8% of the prompt**
and is lifted verbatim in 37.3% of calls. **CANON-ALWAYS is 5.2% and shows no lift** — but SYSTEM
tells the model not to reuse canon's wording, so that zero is the F36 rule working and this
instrument cannot read it as failure. **CANON-TRIGGERED and STRING were never sent at all**, in any
of the 61. Not a low rate — absent.

So the answer to the question above is narrower than the question: nothing here justifies another
retrieval tier, and the thing to fix is that the selective tier has never once fired. **And the
claim that making it fire would make the prompt smaller does not survive this** — the prompt is 60%
prose and canon is 5%. The case is precision, not size.

### ~~Doorless code, found 2026-08-27~~ — ALL THREE CLOSED, verified 2026-08-28

Not bugs and not decisions: finished engine work with nothing that opens it. The class this repo
keeps hitting. Checked in the code rather than in the commits that claim them: `POST /api/remember`
has a method at `web/api.js:126` and a button at `web/app.js:1508`; `test/web.ts:217` runs the guard
in both directions, so a route with no `api.js` method is a red unless it is named in `NO_CLIENT`;
and `DEFERRED` is down to `delBranch` alone with a comment saying why a stale name there is a hole.

- **`POST /api/remember` has no caller.** `routes.ts:1047`, driven only by `test/memory.ts`.
  `web/api.js` has no method for it, so nothing on any surface re-runs the character-memory pass on
  a chapter that closed while the router was down — the one case the route exists for.
- **`test/web.ts`'s guard runs in one direction.** It asserts every `api.js` method has a caller in
  `app.js`; it does not assert every route has an `api.js` method. That is how the above got here,
  and both directions belong in the check.
- **Its DEFERRED list is stale.** `rollup` and `delArc` have had callers since arcs got a surface
  (`app.js:2705`, `2712`), and a name in DEFERRED is skipped by the orphan check — so deleting that
  surface again would go unnoticed. `delBranch` is the only entry still true.

### The opt-in scenario had gone stale, 2026-08-27

`test/ui/model.js` is the only suite that waits on real generations, so it is not in the default
set and nothing runs it unless somebody asks. It was last touched **2026-08-24**; "Edit is the only
door" landed **2026-08-26**. Its step 4 focused a passage and typed into it, which worked while
every passage carried `contenteditable` and cannot work now — a plain div is not focusable, so
`focus()` does nothing, `blur()` fires no event, and nothing saves. `handlers.js` was updated the
same day it changed; this one was not, and sat red-in-waiting for three days.

Two things follow. The scenario presses Edit now, the way `handlers.js` has all along. And **an
opt-in check is a check that rots**: run `test/ui/run.sh model` on the day any prose-editing or
composer change lands, or it will be reporting on an app that no longer exists.

~~**And it is owed a run right now.**~~ **Run 2026-08-28.** `model` was rotted by the streaming
change and is fixed — 39 ok, 0 red. `ritual` is fixed too — 24 ok, 0 red. It had been
reading `Chapter N`, the placeholder `endChapter` writes, as Anansi's answer, and so read the beat
box before she had filled it. The model was never returning an empty beat; that was written down as
a finding for half an evening and it was wrong. See BUILD-STATE §7. What follows was the argument for running them:

 2026-08-27 and 28 changed the composer (it grows rather than
moves, ⤢ flexes it to the whole screen, the hardware-keyboard preference) and the context bar (full
width under the header, and it reads the tokenizer's count rather than the estimate). `model` and
`ritual` have not been run since. By this section's own rule that is exactly when they rot.

### Queued from round four, not built

What is left of round four's `bugs.md`. Everything else on it is built and is in the walk below.

- **Chapter information should be autofilled by the model and accepted by you**, on every new
  chapter and not only the first. Ready to build, no decision needed.
- ~~**Threads linked to other threads**~~ — **shelved by Seth, 2026-08-26.** Not deferred: he chose
  the character memory over it.
- ~~**Web search through pi.**~~ **Dropped by Seth, 2026-08-27.** Not blocked — decided. Written
  down rather than deleted because the reason outlives it: every search would have been a cloud
  provider turn in an app that makes no outbound request at all. `ANANSI_SEARCH` in `llama.ts`
  stays and is still off unless configured — a URL template pointed at whatever you trust is a
  different door from a provider chosen for you.
- ~~**"Some touch events do nothing."**~~ **Reproduced and measured — F34.** A tap that drifts 24px
  does nothing; 14px still works. Not the ⋯ hover gate. Unfixed on purpose: see the note above.

### Built since round five, owed a walk

Everything below landed on 2026-08-26 after the round five pass, in one long day. None of it has been
used by the person it is for except where Seth reported a bug against it, which is noted. This is the
next walk.

**The second half of the day, from Seth's own testing:**

- **F34 is FIXED.** A tap that drifts is delivered anyway — and the first version of that fix ate
  scrolling ("i cant scroll without opening something"), so it now takes three tests: the distance,
  whether the page MOVED, and whether the finger came to rest. What is falsified and what is not is
  written into `web/app.js` beside it; the distance ceiling and the scroll check are belt to braces
  and neither is independently covered.
- **A flag you could count and never open.** Its passage was a take rolled away from, so the shelf
  saw it and the page could not show it. Filtered on `selected`, not swept — an unselected take is
  one you can switch back to.
- **Branching was never missing**, only unreachable: it sat at the bottom of the History panel under
  the fold. It is in the three-dot tray now.
- **Prose is set like a book.** Paragraphs, dialogue breaking out into its own, indent rather than a
  blank line, first paragraph flush. Edit hands back the raw text, because `textContent` over `<p>`
  children would have glued the passage into one line on save.
- **Your own lines sit on the left margin** with their bar kept, a third bar marks a passage written
  to your direction, and the last passage on the page is boxed.
- **One door to the menu.** The hamburger is gone; the web in the bar opens a full-screen sheet from
  the bottom. "All stories" is now "Anansi's web".
- **Ten help webs**, on the concepts only — a number in a help body fails a check on purpose.
- **The shelf says what is waiting** across every book, and Report an issue is on the menu with its
  own page, filed through `gh` and carrying the build but never the prose.
- **Tapping the prose no longer edits it**; Edit is the only door, and the keyboard shortens the page
  rather than covering the composer.

**The first half:**

- **The character memory.** Closing a chapter proposes, for each character it changed, their whole
  description rewritten as it now stands — in force from the NEXT chapter, so revising the closed one
  still sees them as they were in it. Proposals, not writes. `POST /api/remember` re-runs it on a
  chapter that closed while the router was down.
- **The five-step wizard**, with Accept on every step. Step 4 offers only the cast you kept on step 3.
- **The spark proposes who you play** and who the model never writes, and both are yours to change.
  A name it proposed that leaves the cast is dropped and said out loud; a name you typed never is.
- **The model opens a story and every chapter**, as a switch, on by default. It is the Continue
  button pressed for you, not a second engine.
- **Anansi has a personality** — the trickster who likes a knot. F35 has the before and after.
- **Invented content and the spark** both come back worth writing from now, not one line.
- **The ⋯ tray opens centred** over the content, and a double tap opens it too.
- **Reading mode**, as a button: the composer goes, the prose stops taking taps, the draft survives.
- **An entry copies into another of your own books**, keys and all — but not its states.
- **The default voice is yours to change**, with a one-press Quick apply and ours as the backstop.
- **The on-screen keyboard** shortens the page instead of covering the composer, and the phone's dock
  and bar now pay for the safe-area insets `viewport-fit=cover` has been spending.

~~**Not fixed: F34's drift threshold.** A tap that moves 24px still does nothing.~~ **Fixed, and
this file disagreed with itself about it** — the section above already said "F34 is FIXED" while
this one said the opposite. `web/app.js:3416` is the band: under 10px the browser fires click
itself, over 30px is a scroll, and 24px sits inside it. Two further tests carry the case the fix
was worried about — the page must not have MOVED, and the finger must have come to rest — so a
40px scroll that began on a story card no longer opens it. The `ponytail:` marker above them still
stands: neither of those two lines is independently covered.

### Agreed with Seth, not built

Where the next session starts.

- ~~**Chapter information autofilled by the model and accepted by you**~~ — **built 2026-08-27.**
  It proposes a title and the beat when a chapter opens; both are yours to change and neither is
  saved until you press Save.
- ~~**pi web search.**~~ **Dropped by Seth, 2026-08-27.** A decision, not a deferral.

**Takes: deleting them, and rerolling on the instruction that made them:**

- **Deleting a rerolled passage looked like it did nothing.** Delete removes the take on screen and
  promotes the newest survivor, which is correct — SPEC 6.1.5 says a slot always has one — so a
  passage rerolled three times took four presses and the block sat there three times holding
  different words. The tray now offers **Delete all N takes** beside it, two-press confirmed like
  the other, keyed so confirming one does not arm the other. `db.delSlot` reports how many it took.
- **A reroll of a directed passage ignored the instruction that made it.** Two faults, one report.
  `addVariant` never carried `directive` — it was not in the INSERT — so a take of a directed
  passage came back undirected, the margin mark vanished, and a second reroll had nothing to
  inherit. And the generation sent no directive at all, so the reroll answered a question nobody
  had asked. Both fixed at the source: the take inherits it the way `speaker` already did, and
  `inherit()` in `routes.ts` reapplies it.
  **The mode has to come back with it.** `direct` is the only mode template that mentions the
  directive — speak and act take a speaker and ignore it — so inheriting the text without the mode
  puts the instruction somewhere no template says it out loud. Falsified exactly there: leaving the
  mode alone turns "rerolling a directed passage sends the instruction that made it" red. An
  explicit directive in the request still wins, which is the writer typing a new one.
  The surface says which instruction it re-ran, because silently obeying an old steer reads as the
  model deciding for itself.

`POST /api/manifest` goes through the same `inherit()`, or the Context panel would preview a prompt
the generation is not going to send.

**`handlers` is intermittent, and it died once.** In a full run on 2026-08-27 it stopped at
**19 ok** — before any of the checks added that day, in the `window.fetch`-patching manifest
section — with a dropped CDP connection (`undici` websocket, not an assertion). A machine doing
other work at the time is the likeliest cause and that was self-inflicted: a service restart and a
run of database probes while the suite was live. It re-ran green alone and green in a clean full
run. **Not diagnosed, only survived**, so it is written down: if it dies there again, the suspect is
the global `window.fetch` replacement in that section, not the scenario length.

One check in `test/ui/handlers.js` earned its own note: the first version of the delete-all block
threw inside `page.eval` when the control was missing, and took the two assertions after it down
with it — **37 ok, 1 red** where there should have been three reds. A failing `else` on the guard
makes it **37 ok, 3 red**, which is the count holding. Same shape as the four inert blocks found on
2026-08-24.

**A second pass on the threads, after Seth walked the first one:**

- **The menu's Threads page really was not opening a thread — on a phone.** The first fix loaded the
  book, which was the missing half, and the press still read as nothing happening: `.split` becomes
  a column on a phone, so the editor beside the list sits BELOW every book's threads. Measured at
  **1183px from the top of the viewport** by the check that now covers it. The editor replaces the
  list there, the way the story panel already did, and `‹ Back` returns to it. Same family as the
  report at the top of `test/ui/phone.js` — the press worked and the result was off screen.
- **Static JS and CSS now say `Cache-Control: no-cache`.** They are read off disk per request so an
  edit is live without a restart, but with no freshness header at all a phone caches heuristically
  — and a fix that is on disk then looks like a fix that does not work. There is no build step and
  no content hash to put in a URL, so the header is the only place to say it.
- **Outfits are editable, and wearable where the wardrobe is.** Wearing existed only as chips on the
  Threads list; the panel holding the wardrobe said "Switch on the Threads panel" instead of
  offering a button, and on the cross-book page there were no chips at all. Each outfit is now a
  name, a body, Save, and a Wear/take-off toggle.
- **A chapter override is editable.** Correcting a wrong chapter number meant deleting the override
  and typing it again.

Both of those last two are the same shape as the proposal body below: `upsertOutfit` and
`upsertState` have updated by id since they were written, with the ownership check on the composite
lookup, and the surface never sent an id. Three routes in one session that were finished and had no
caller. Falsified by dropping the id from each: the outfit check reports **2 outfits** and the
override check **2 states from chapter 2**, which is what the id prevents.

**Three things Seth found in the threads, fixed the same evening:**

- **The menu's Threads page would not open a thread.** The page is a list beside an editor, and the
  editor reads from the OPEN story — so pressing a thread in a book you had not opened set the
  selection and then rendered the "pick a thread" hint again. Nothing opened and nothing said why.
  It loads that thread's book now and stays on the page, which is what the two-column layout was
  for. The hint that apologised for it ("Editing needs its story open") is gone with it.
- **A story's Threads panel had no door to the one that spans every book.** You had to leave the
  story first, and then know that Threads out there means something wider than Threads in here —
  this repo's own recurring failure, a finished feature with nothing that opens it. `data-leave`
  takes a page name now, so one button goes straight there.
- **Accepting a proposal wrote something you had never read.** The card showed `delta || body`, and
  for a conflict or an update the delta is a summary — the paragraph about to enter canon was not
  on screen at all. Both are shown now, and the body is a box you can rewrite first.
  `POST /api/proposal` has honoured an incoming `body` since it was written; nothing ever sent one.
  Both the chapter queue and Anansi noticed under Strings, because they share the one handler.

Falsified, each one: removing the workspace branch turns two of the six new browser checks red,
and making the handler stop reading the box turns "carries what is in the box, not what the model
said" red.

**Done later the same evening, from this list:**

- **The shelf is two columns and New story is a button.** The dashed cell was a book-shaped hole
  taking one of the columns from a book that exists; it is a plain button between the hero and the
  grid, and it is what a phone sees too because the bar's pill is `deskonly`. The grid's 3-column
  rule and its now-redundant 1099px breakpoint both went. `test/app.ts`'s canned library is three
  books rather than one for this: with one story there is no grid to come after the button, so the
  order assertion was true wherever the button was put. Falsified — moving the button below the grid
  turns "and before the rest of the shelf" red.
- **Hero images.** Built, and it needs your eye rather than another check: pick one under Story →
  The cover and see whether a real photograph survives 900px and JPEG 0.82 on the hero card.
  **One deviation from what was agreed, and it is deliberate:** the bytes are in a side table
  `story_covers`, not a column on `stories`, because `listStories` selects `s.*` — a blob in that
  row is read off disk and handed to JS for every card on the shelf, on every paint. Same one
  database file, so the backup argument that decided this is untouched. The shelf is told only
  *when* the cover was set, and that timestamp is the cache key: `/api/cover?story=…&v=<set_at>`
  answers `immutable`, so a cover is fetched once per change rather than once per paint. Refused
  at the boundary as bytes, not as a label — a PNG relabelled `image/jpeg` does not get stored,
  which is the case a Content-Type check cannot see. The seven end-to-end checks in
  `test/ui/surfaces.js` paid for themselves on the first run: a double quote inside `style="…"`
  ended the attribute at `background:url(`, so the card had neither cover nor gradient — green in
  every unit check and in `test/app.ts`, invisible until a browser rendered it. Not covered: how it
  looks. Nothing asserts that a photograph reads well behind the title, and nothing can.
- **`README.md` said the allowlist lives in a run command.** It has lived in an untracked `.env`
  since `bcccbad`, read by `node --env-file=.env` and by `anansi.service`'s `EnvironmentFile`
  alike. The Run it block now says so, with the two keys named.

### Already built, and round four could not find it

Three of round four's asks exist end to end and were reported as missing. That makes discoverability
the finding, not the features — and round five's clean pass does not clear it, because nothing in
that walk sent you looking for them. **Owed a walk next round**, worded as "find X" rather than
"check X works":

- **A card's history, and revert.** `GET /api/history`, `db.entryHistory`, `revertField`, and
  `app.js` already calls it for entries.
- **Two tiers of recovery.** `passage_revisions` and `entry_revisions`, each revertable.
- **Canon over time** — updating a lore card from a chapter onward. `entry_states`, `POST /api/state`,
  and the state in force is resolved at assembly so chapter 3 cannot leak what chapter 7 established.

### Waiting on you, not on me

- **The walk of what was built since round five** — the memory, reading mode, the keyboard. Built and
  tested, not yet used by the person it is for.
- **§2, the passage length.** Shorter twice over — `max_tokens` 900 → 450, and F29 took the
  paragraph count out of Continue's prompt, which halved it again on the bench fixture. The samples
  read as complete beats, but whether that is the book you want is a taste question no benchmark
  answers.
- **The four decisions** in `docs/archived/DECISIONS.md`. §1 interiority's shape and §2 the 82.5% —
  F28 now says a standing instruction in the prompt does not touch interiority at all, so if you
  want that number moved it needs a different lever and which one is yours to pick. §3 prompt
  override composition, which is the one thing not built inside a finished item: an override
  replaces rather than merges and nothing validates it beyond refusing a blank. §4
  character-by-prompt and what reroll re-rolls — your answer in round three was a global lore
  reroll, or one entry, or one box, and none of it is built.

### Fixed overnight 2026-08-28 on `surface-fixes`, with what each cost to find

- **The reroll's veil waited for a token that could not arrive** (PLAN-07 bug 1). `regenerateInto`
  passed `atEnd ? (d) => ghost(live += d) : () => {}` and BOTH halves were dead — `ghost()` takes no
  parameters and `live` was never read. It held the veil back until the first token and never raised
  it at all if the model errored first, which is exactly the cold-start blank page the veil exists
  to cover. Raised on the press now.
- **A failed accept left the composer offering to stop a finished call** (bug 2). `generate()` set
  `S.busy` false and redrew nothing; `regenerateInto` has always had the right idiom on the same line.
- **`@keyframes breathe` was declared twice** (bug 3), so the veil never pulsed at the amplitude
  written for it — the later declaration wins for both. Renamed, and `test/web.ts` now asserts every
  keyframe name is declared once AND that every name a rule animates exists, which is the same
  mistake from the other side.
- **The passage tray opened under a full-screen surface** (#2). On a phone `#rail` (40),
  `#appearance` (41) and `#dock.big` (41) all sit above the tray's 32. Measured, not reasoned. Rule:
  while a full-screen surface is up there is no tray. `test/ui/tray.js`, in the default set.
- **Send and the expand button were under the touch floor** (#3): 30px and a bare 13px glyph. Both
  44px on a phone now, 34px on a desktop where the pointer is exact.
- **The speak-as row was inset three times over** (#4) — the dock's 18px, then `#asRow`'s 18, then
  `.inner`'s 18, against the 18 the mode rail sits at. Asserted as alignment with `#modes`, not as a
  number.
- **The logo carried Obsidian's plate and Obsidian's gold on all nine themes** (#6). Inline SVG in
  the rail now, no plate, `currentColor` from `--gold`. `web/icon.svg` is untouched and is still the
  favicon and installed icon, where an opaque plate is correct.
- **Four over-exported functions in `import.ts` narrowed** — `parse()` is the one door and nothing
  outside the file named them. Found by `bench/sweep.ts`, which is new: a static read-only pass for
  dead exports, unreachable controls, orphan ids and orphan localStorage keys.

**THREE TIMES THE DETECTOR WAS THE THING THAT WAS WRONG**, and each is written beside the check it
fixed. #4 first compared a padded element's own bounding box and stayed green when the padding came
back. #6 first switched `data-ui-theme` and compared strokes, when a theme is applied by writing CSS
variables and not by an attribute. And `bench/sweep.ts` reported 123 dead handlers, then five
phantom actions, then read its own comment as evidence — three parse faults in one tool before it
said anything true. Validate the detector before believing the result, three more times over.

### Found and fixed on 2026-08-28, listed because of how they hid

- **`VOICE` was painted as a kind the app does not recognise, on every call.** `web/model.js` holds
  two maps that must both cover the engine's ten block kinds; `BLOCK_ORIGIN` covered ten and
  `BLOCK_COLOR` covered nine. `app.js` falls back to `var(--ink-ghost)` — the colour meaning "a kind
  I have no entry for" — so the meter segment and its legend dot were grey. `bench/utilisation.ts`
  measured VOICE present in **61 of 61** scored generations at **8.4% of the prompt**: every call
  with a voice sample. The check that would have caught it was twelve lines away, guarding the
  other map. Replaced by one table in `test/web.ts` naming every shared vocabulary, walked both
  ways — see `docs/findings/COUNCIL-05.md`.
- **Two dead columns are still on the disk.** `passages.token_counts` and
  `stories.system_block_override` were cut from the source on 2026-08-23; SQLite does not drop
  columns and nothing migrated them out, so Seth's `anansi.db` still carries both — and
  `exportStory` copies them into every standalone database it writes. **Not fixed.** It needs a
  migration or a written decision, and it currently has neither.

- **The story-model select could not clear the one pin that needed clearing.** `The Shadow's Debt`
  is pinned to `rp-t-glm47flash-h`; the router's preset list was rewritten on 2026-08-27 and that
  name stopped existing, so nothing in the select carried its value, **nothing was selected**, and
  the browser showed the first option — "Default" — while the hint underneath said the story was
  pinned. Choosing Default then fired no `change` event, because the value had not changed. The
  press worked and the result did not, again. A pin the router no longer offers gets an option of
  its own now, selected, saying so. **The database still holds the pin** — the fix makes it
  clearable, it does not clear it. Open the Storyteller panel and pick Default.
- **`test/app.ts`'s `ok()` takes a message only, and six other suites' do too**, while `db.ts`,
  `engine.ts` and `stream.ts` take a callback and call it. A check written in the wrong style
  prints green for a body that never runs — which happened once on 2026-08-28 and was caught only
  by breaking the code under test three times and watching nothing go red. All seven now throw on a
  second argument rather than swallowing it. Fifth instance of this family.

### Measured, known, not fixed

- **Anansi still leaks instructions into a reply** sometimes, and an unasked proposal is variable
  rather than gone — two runs of the same probe gave four and then none (F26). Neither is a
  candidate for more prompt; a code-side gate is a product decision.
- **Invented `keys` sometimes repeat the title**, which the prompt tells it not to (F27).
- **The contradiction repair costs 1.5s on every generation** and there is no switch to turn it off
  (F30).
- **Anansi's chapter numbers** are right now that it is told which chapter it is looking at, but
  that is one run against one story (F33).
- **The prose quotes the ledger** (F36). Both prompt halves are in — `render.ts:32` tells SYSTEM
  that canon is what is TRUE and never how to say it, and INVENT already had its version. What is
  NOT established is that it worked: **0 in 6**, no before/after, which bounds the rate under about
  40% and nothing more. Needs a real arm on `bench/quote-detect.ts` before anyone calls it fixed.
- **Nothing looks for internal coherence** (F36's other half, and it has no marker anywhere). The
  contradiction checker compares a passage against canon, so a passage that lifts canon's wording
  while contradicting itself — the guitar out of a coat pocket — agrees with canon perfectly. No
  amount of tuning the contradiction prompt reaches this class.

### Deliberate debt — twenty-four `ponytail:` markers

**Counted 2026-08-28, not recalled:** `routes.ts` 6, `db.ts` 6, `app.js` 3, `context.ts` 3,
`serve.ts` 3, and one each in `prompts.ts`, `app.html`, `bench/ledger-audit.ts`. The prose below was
written when the count read twenty-one and names fifteen; it is left as it stands rather than
padded, because naming the three it does not cover takes reading them, not adding a number.

Three are architecture and are not going anywhere soon: SQLite rather than Postgres (pgvector is
unscheduled), no streaming backpressure, and ceilings-with-a-refusal instead of a budget engine.
The other fifteen each name a ceiling: the markdown and JSON exports carrying a cover's timestamp
and not its bytes (the standalone-database export does carry it), one stored-and-ignored entry column (`priority`; the comment claiming three was wrong and is fixed), a LIKE scan that goes
linear at chapter 40, rejected takes recorded but not fed back, the repair's length floor,
prompt-override validation, the remaining key logic (secondary keys, exclusion keys, regex), the
checker's blindness to numeric contradictions, the whois cache holding an IP for the life of the
process, two writers on two different models being unmeasured against VRAM, the memory pass reading a whole
chapter in one call, the UI scale being `zoom` rather than a rem refactor, the persona being carried
by title rather than by id, and the big one below.

**Revisit before putting anything in front of Anansi.** `serve.ts`'s loopback-is-the-desk rule is
what a reverse proxy would break, and it would break it OPEN. Caddy on 443 for port-free names
(`anansi.purfleet.dev`) makes every request arrive from `127.0.0.1`, so the second writer resolves to
the desk: her library replaced by yours, `admin` true, `ANANSI_ALLOW` never consulted, and nothing
logged. The Tailscale grant still passes — it is the identity layer that goes blind. Safe today only
because nothing proxies. The marker in `serve.ts` names three upgrades and which one must not be
landed by halves.

`grep -rn "ponytail:" src web bench *.ts *.html` is the ledger. Full COUNCIL-04 write-up with line
numbers: `docs/archived/COUNCIL-04.md`.

## Four decisions, and F28 moved two of them

`docs/archived/DECISIONS.md`.

1. **Interiority's shape** — my recommendation is still option A, build nothing.
2. **The 82.5%** — F28 now says a standing instruction in the prompt does not touch it. If you want
   that number down it needs a different lever, and which one is your call.
3. **Per-account prompt overrides** — where stored, how they compose, what a bad one does.
4. **Character by prompt**, and what "reroll" re-rolls. Your answer in round three was: a global
   lore entry reroll, or one entry, or one input box. Not built yet.

---

## Measured since round three

`docs/findings/P0-FINDINGS.md`.

- **F25** — Anansi's cut-off answers were the grammar, not the token budget. Exactly 1,400
  characters, mid-word, valid JSON. Two adjacent defects fell out of measuring it.
- **F26** — the voice. Two over-corrections caught only by re-probing. Two residuals not fixed.
- **F27** — the invent button took three passes, and pass one reproduced F25 the same day.
- **F28** — the lockout. Dialogue to zero, action cut by two thirds, interiority untouched.
- **F29** — the mode prompts. The checklist was being filled 10/10; taking the paragraph count out
  of Continue halved the passage.
- **F30** — the contradiction repair costs 1.5s on every generation, flat, and fired 0 times in 6.
- **F31** — chapter 120 does not fit, and Acts fix it: 4,083 tokens against 11,440.
- **F32** — the eviction order was alphabetical in one place and creation order in the other.

Read F28's last section if you read nothing else: **the detector was wrong twice**, and the second
time it survived a fixture built to fix the first, because the model re-genders characters against
canon. Every rate in it is a floor.

---

## Parked on purpose — not lost, not being built

- **An image attached to an issue.** Seth, 2026-08-28: *"being able to append an image to the issue
  would be great too ... no thats fine we can drop the image on an issue. it was just a thought.
  keep the idea though. in case i change my mind later."* Raised and dropped in the same sitting.
  Nothing is built and nothing is half-built.

  The reason it is not a small job: the in-app bug reporter files through the GitHub API, and there
  is **no public API endpoint for attaching an image to an issue** — the web UI uploads to a private
  host that is not part of the API. So the image has to live somewhere first, and that choice is the
  whole design: commit it into the repo and link the raw URL (permanent, and it puts screenshots in
  the git history forever), or POST it to a gist (out of the repo, another thing that can 404). A
  phone screenshot of a rendering bug is exactly the report that is hardest to write in words, which
  is what makes it worth doing if it comes back.

## Running the tests

```bash
node --experimental-strip-types test/all.ts    # eleven suites, no model — the harness prints its own total needed
test/ui/run.sh                                 # seventeen scenarios, headless, no model — prints its own total
test/ui/run.sh "model ritual"                  # the two that wait on real generations (39 + 24 ok)
node --experimental-strip-types bench/lockout.ts check    # F28 detectors, no model
node --experimental-strip-types bench/modes.ts check      # F29 detector, no model
node --experimental-strip-types bench/drift.ts check       # 2a's detector, no model
node --experimental-strip-types bench/drift.ts             # the drift report, read-only db
node --experimental-strip-types bench/sweep.ts             # dead code and half-built, static, no db
```

