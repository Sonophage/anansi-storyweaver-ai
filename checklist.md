# What is open — after a day's work on 2026-08-26

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
node --experimental-strip-types test/all.ts     222 checks, eleven suites, no model
test/ui/run.sh                                  473 checks, twelve scenarios, no model
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
nothing in the database can fire. `bench/utilisation.ts` and `bench/ledger-audit.ts` in
`PLAN-06-MEMORY.md` §5 are the instruments; neither exists yet. **Do not call this an improvement
until one of them has run.**

### Doorless code, found 2026-08-27

Not bugs and not decisions: finished engine work with nothing that opens it. The class this repo
keeps hitting.

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

### Queued from round four, not built

What is left of round four's `bugs.md`. Everything else on it is built and is in the walk below.

- **Chapter information should be autofilled by the model and accepted by you**, on every new
  chapter and not only the first. Ready to build, no decision needed.
- ~~**Threads linked to other threads**~~ — **shelved by Seth, 2026-08-26.** Not deferred: he chose
  the character memory over it.
- **Web search through pi.** The tool is `web_search`, built into pi's core and activated by the
  provider, so the integration is `execFile('pi', ['-p', q, '--mode', 'json', '-t', 'web_search'])` —
  an argument array, no shell, the pattern llama.ts already uses for systemctl. **Blocked:**
  `pi auth check --provider google` returns `credentials_not_configured`, so there is nothing to
  integrate against yet. Worth knowing before it lands: each search becomes a cloud provider turn
  rather than an HTTP GET, in an app that currently makes no outbound request at all.
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

**Not fixed, and named so it is not mistaken for done: F34's drift threshold.** A tap that moves 24px
still does nothing, on the shelf and everywhere else. The fix needs agreeing, because its guard done
wrong makes Delete run twice.

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
- **The four decisions** in `docs/plans/DECISIONS.md`. §1 interiority's shape and §2 the 82.5% —
  F28 now says a standing instruction in the prompt does not touch interiority at all, so if you
  want that number moved it needs a different lever and which one is yours to pick. §3 prompt
  override composition, which is the one thing not built inside a finished item: an override
  replaces rather than merges and nothing validates it beyond refusing a blank. §4
  character-by-prompt and what reroll re-rolls — your answer in round three was a global lore
  reroll, or one entry, or one box, and none of it is built.

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

### Deliberate debt — twenty-one `ponytail:` markers

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
numbers: `docs/findings/COUNCIL-04.md`.

## Four decisions, and F28 moved two of them

`docs/plans/DECISIONS.md`.

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

## Running the tests

```bash
node --experimental-strip-types test/all.ts    # 222 checks, eleven suites, no model needed
test/ui/run.sh                                 # 473 checks, twelve scenarios, headless, no model
test/ui/run.sh "model ritual"                  # the two that wait on real generations
node --experimental-strip-types bench/lockout.ts check    # F28 detectors, no model
node --experimental-strip-types bench/modes.ts check      # F29 detector, no model
```

