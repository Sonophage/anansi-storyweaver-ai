# Build state — 2026-08-27 (fourth pass)

> **STATUS: LIVE.** Audited against the code, not from memory — twice this document has been wrong
> because someone wrote it from recall. If it disagrees with the source, the source wins and this
> is the bug.


Audited from the code, not from memory. Three categories: **done**, **half-built** (the dangerous
one — it looks finished from the UI), and **not started**.

---

## 1. Done and load-bearing

| | Where |
|---|---|
| Pure `buildContext`, named blocks, render-from-blocks-only | `src/context.ts`, `src/blocks.ts`, `src/render.ts` |
| Overflow guard that names the block the server would drop | `src/context.ts` §6.4 |
| Canon 45% cap and the EARLIER ceiling | `src/blocks.ts` |
| Plain keyword activation, scanning prose **and the directive** | `src/context.ts` |
| Persistence: 15 tables, cascade deletes, partial indexes on `selected` and on the worn outfit | `src/db.ts` |
| Variants — regenerate keeps every take, nothing deleted | `db.addVariant` / `selectVariant` |
| Chapters with manual start and end; breaks are real passages | `db.endChapter` |
| Chapter summaries (manual trigger) | `POST /api/summarize` |
| One responsive surface on one engine, one API, one field schema | `app.html`, `web/api.js`, `web/model.js` |
| `generations` logged on every call, including failures | `db.logGeneration` |
| 34 engine tests that run with no model up | `test/engine.ts` |
| Per-story export to a standalone database | `db.exportStory` |
| Import: Anansi exports, AI Dungeon (both halves of a real export), character cards V1/V2/V3 | `src/import.ts`, wired to the Import screen |

---

## 2. Half-built — schema or plumbing exists, the feature does not

**This is the list that matters.** Each of these looks done from the outside.

| Thing | What exists | What is missing |
|---|---|---|
| ~~Revert~~ | History panel on every passage; restoring is itself kept | **Done.** |
| ~~Summary staleness~~ | SHA-256 over covered prose, recomputed on read; stale summaries excluded from the prompt with a reason | **Done.** |
| ~~Auto-summary~~ | Fires on chapter close | **Done.** |
| **Search** | A `LIKE` scan | Fine at this size. The unused FTS5 table beside it has been dropped rather than left looking like a feature. |
| **The model** | Process default, **overridable per story** (`stories.model`), an `ANANSI_MODELS` allowlist, and stop/restart of the router unit from Preferences | Whole. The router runs `--models-max 3 --models-autoload`, so three co-reside and a switch usually costs nothing. |
| **Branches** | `branches` table, rows, `branchesOf`, switching, **and forking** from a passage's History | Whole. Forking landed with the History panel; the row that said "no fork action" was stale. |
| ~~`generations`~~ | One row per call with the full manifest | **Done.** `GET /api/activity` reads it and Preferences shows prefill seconds and rate per call. The row saying "never read" outlived the route by three days. |
| **Entry knobs** | `sticky_for`, `proper_nouns`, `priority` columns | **`priority` only.** `context.ts` reads `properNouns` when it folds and holds an entry open for `stickyFor` passages after it last fired. `priority` needs the budget engine to mean anything. |
| ~~Export~~ | Markdown and JSON, with proper download headers | **Done.** |
| ~~Spark~~ | Idea in, skeleton out, cast proposed as entries, every field editable before accepting | **Done.** |
| ~~Canon violation flags~~ | Runs on accept, flags inline on both surfaces, dismissable | **Done.** F1 0.89 measured — see P0-FINDINGS F11. |
| ~~Extraction~~ | Reads a chapter, classifies new/changed/conflict, queue on both surfaces | **Done.** Nothing is canon until accepted. |
| ~~Canon over time~~ | States anchored to a chapter, resolved at assembly, hide-or-hint before opening | **Done.** Lens 5's ONE THING, with 5 engine tests. |
| ~~Chapter pins~~ | force_in / force_out per chapter, composite FK closes SPEC §7.1's cross-story leak | **Done.** |
| ~~Entry history~~ | Per-field revisions with provenance, restore, on both surfaces | **Done.** |
| ~~Cross-story isolation~~ | One central gate plus scoped writes; 12 checks in `test-scope.ts` | **Done.** The audit found no ownership check on any of 27 routes. |
| **Tests** | **201 across eleven suites** (41 engine, 46 db, 31 scope, 12 import, 7 stream, 8 mend, 5 memory, 4 report, 11 talk, 15 web, 21 app), plus **467 driven-browser checks across twelve scenarios**, all green on 2026-08-27 — plus `model` and `ritual`, which wait on real generations and are not in the default set — and the model evals in `bench/` | Routes are covered only through the client-contract check; no HTTP-level suite yet, and that check runs in one direction only — see the correction of 2026-08-27. |

---

## 2b. The debt ledger

Everything deliberately unfinished carries a `ponytail:` comment at its site, so it is harvested
from the code rather than remembered:

```
grep -rn "ponytail:" src web bench *.ts *.html
```

**Twenty-one markers as of 2026-08-27.** The ponytail audit of 2026-08-23 cut two phantom block kinds, two unread columns and a retired harness, and added one: `/api/import` was the only route in the tree with no caller. That one is gone again — the Import screen calls it now. One was added with rejected takes: the flag is recorded and shown but not sent to the model, because feeding a rejected take to the prompt is a prompt change and F20 is what those cost to justify. Each remaining marker names what is missing, why it was left, and the upgrade path.
Nothing in this list is a surprise; the point is that adding to it requires writing down the ceiling.

| Where | What is unfinished |
|---|---|
| ~~`render.ts`~~ | **F9 retired as stated.** Dropping the title made no difference (F12). At n=300 per arm the true rate is 4.0%, not 10-20%, and restating canon near the generation point halves it — directionally, not significantly (F15). Open as a low-rate defect; the harness is `bench/ab.ts`. |
| `prompts.ts` | The checker misses numeric contradictions. One case in twelve. |
| `context.ts` | Word folding, sticky windows, proper-noun exemption and POV force-include are **done**. Still missing: secondary keys, `key_logic`, proximity bound, exclusion keys, regex keys — all of which address multi-word false-firing. |
| `context.ts` | No budget engine — ceilings and a hard refusal only. No reservation, trim ladder, eviction, or `partial` state. |
| `db.ts` | SQLite, not Postgres. No pgvector, no RLS. |
| ~~`db.ts`~~ | **Done.** Copy-on-write forking, branch switching, discard. Every read follows the active branch. |
| ~~`db.ts`~~ | **Done.** `arcs` collapse a run of chapters into one act-level summary; covered chapters stop being sent. |
| ~~`db.ts`~~ | **Done.** `notes` is editable on both surfaces and unrenderable by construction — the engine's `Entry` type has no such field. |
| — | **Per-story llama sessions retired, not deferred (F16).** `--cache-ram` defaults to 8 GB; rotating six stories costs four tokens. Nothing to build. |
| `db.ts` | `priority` is still stored and ignored — it needs the budget engine to mean anything. `sticky_for` and `proper_nouns` are now used. |
| `db.ts` | Search is a LIKE scan. |
| ~~`routes.ts`~~ | **Done.** `GET /api/activity` reads it; Preferences shows prefill seconds and rate per call, which is PLAN-02 §7.2's trigger made observable. |
| ~~`routes.ts`~~ | **Done.** Story covers. `story_covers` holds the JPEG, downscaled to 900px in the browser; the shelf is told only the `set_at`, which keys an immutable URL. A side table and not a column on `stories`, because `listStories` selects `s.*`. |
| ~~`serve.ts`~~ | **Done.** `tailscale whois` on the peer IP, an `ANANSI_ALLOW` allowlist, one owner resolved per request, and the sampler moved from the process to the owner. 22 checks in `test/scope.ts`, two of which are the allowlist itself. |
| — | Adventure mode **dropped** (Seth, 2026-08-23), not deferred. Nothing to build. |
| — | Design screens D9, D10, D14 not built as surfaces. `desk.js` is deleted; the row named a file this same document records as gone. |
| — | Manifest and icon **done** — it installs. No service worker anywhere in the tree, so no offline read; SPEC §13 M7's warning about workers and streaming POSTs is still unanswered. |

---

## 3. The plan's own phases, against the code

PLAN-02 §9 sets each phase by an exit criterion. Audited against the source, not the phase order —
which is why the picture is lopsided.

**P3 — "Two people write different books at the same time without noticing each other." 20-30h.**
**This is the hole.** Multi-story works and the story `status` field carries draft/finished. Missing:
the second tenant's whole path, the status strip, and the character wizard. Advisory locks are
retired, not missing — see F19. Everything P3 needs *underneath* is built and tested — ownership, scoping,
export — so this is the last structural gap and it is gated on a device, not on design.

**P4 — "A fact pinned in chapter one reaches chapter twenty on its own." 20-30h. Substantially done.**
Entries, keywords, always-on versus triggered, interiority notes, POV force-include, sticky, the live
fire preview (`desk.js` shows the keyword that fired and what it cost), chapter pins — all built.
Missing: full-text search. The FTS5 table that nothing populated was dropped rather than left looking
like a feature; search is a `LIKE` scan.

**P5 — "The ledger fills itself and I trust what it did." 30-45h. Substantially done.**
Extraction under §7.4, the ledger-as-queue with diffs, summary staleness, canon violation checking —
all built. Missing: **memory collect-versus-inject**, which is vector recall. `RECALL` is no longer
even a `Kind` — it and `LORE` were removed, and `blocks.ts:12` records why: nothing ever added a
block of either, lore renders as `CANON-*` by its activation, and the eviction sort means putting
them back changes nothing else. Add them with the code that fills them.

**P6 — "The book is longer than the window and it still holds." 40-60h. Correctly waiting.**
The meter, the 45% canon cap and the EARLIER ceiling were built ahead of the phase. The budget engine
itself — reservation, trim ladder, eviction, `partial` states, `priority` — is not built, and §7.2's
trigger has not fired: nothing has overflowed since the chapter window landed. F13 doubled the slot to
50,048, which pushes the trigger further out rather than closer.

**P7 — Interop and polish. 12-20h. Substantially done.**
PWA manifest installs. Character-card and lorebook import built, plus AI Dungeon and Anansi's own
export format. Progressions built. Adventure **dropped** by Seth, not deferred. Missing: the service
worker for offline reading, which PLAN-02 itself gated on "only if someone asks".

**Never scheduled:** universes, and Postgres/pgvector/RLS — the last of which P5's recall depends on.

### Correction, 2026-08-23 — five "Done" features had no surface

Deleting `desk.html` and `phone.html` took the only UI for five things this document called
**Done**, and nothing noticed: the engine, the schema and the routes were all still correct, so
every test stayed green. Parity was asserted from "the new surface works", which is a different
question from "the new surface covers the same ground".

Found by asking which `api.js` methods no client calls. Nine did not, five of them here:

| feature | this document said | reality until 2026-08-23 |
|---|---|---|
| Canon over time (progressions) | *"Done. Lens 5's ONE THING, with 5 engine tests"* | no way to add or remove one |
| Entry history, per-field revert | *"Done… on both surfaces"* | both surfaces deleted |
| Export, Markdown and JSON | *"Done"* | no link anywhere |
| Chapter pins, force_in/force_out | *"Done"* | no screen; now deferred to PLAN-04 §2 with a reason |
| Arcs, collapsing chapters | *"Done"* | no screen; deferred to P6 with a reason |
| Deleting a story | not claimed | no way to |

All except pins and arcs are wired and driven in `test/ui/restored.js`. Both exceptions are now in
an explicit DEFERRED list in `test/web.ts` **with the reason**, and that test asserts every other
api method has a caller — so an engine feature losing its surface fails a test rather than going
quiet. That invariant is the actual fix; the five wirings are the consequence.

## 3c. Colour and motion, 2026-08-24

**Every colour flows from a token.** `web/app.js` carried **162 raw hex values** in inline styles,
all of them dark-theme values — so the document themed and the panel and rail could not. A theme
was only ever half applied. Now 12 remain in the JS and all twelve are decoration: three
story-card art gradients and three theme swatches, which have to stay literal because they
*preview* the themes. Nothing in the stylesheet names a colour outside a token definition.

**A theme is one block of variables.** That is the contract, and it only holds because nothing
hardcodes a colour. It removed a special case too: `html[data-ui-theme="parchment"] #modes
button[aria-pressed="true"] { color:#6B5220 }` existed because `--gold-lit` is a light gold and
parchment is a light theme. Overriding the *token* fixes every place that problem appears; the
rule fixed one button.

**One motion system**, declared in `:root`: four durations, three curves. The rule it follows is
that motion explains where something came from — a passage rises because it was written below, a
panel's contents settle after the panel arrives, and a toggle chip does not move at all because it
did not go anywhere. Only the newest passage animates; replaying 358 of them on every repaint
would be a slot machine. Everything is opacity and transform, both composited.

**Three things this found that tests could not see.** They needed computed styles and contrast
arithmetic, so `test/ui/surfaces.js` now carries both, across all three themes:

- **the passage animation never applied.** `#col > .block:last-of-type` means *last `<div>`*, and
  the chapter pager is a div that comes after every block, so nothing ever matched. Green tests,
  no animation. The renderer marks the newest passage instead.
- **parchment's gold was 3.1:1** — cream on cream. Darkened; reverting it turns the check red at
  1.4:1.
- **hint text was 3.56:1 in every theme**, at 11.5px. Raised from `--dim` to `--mute`. This is a
  visual change to Seth's design, made because a hint is the sentence telling you what a control
  does. The threshold was NOT lowered to accommodate it — tuning a check until it stops
  complaining is the same failure as writing one that cannot fail.

## 3b. Surface inventory, verified 2026-08-24

Read out of the code, after a regex-based count of the same thing once reported ten of eleven desk
nav buttons as dead. They were not. **Do not audit a surface with a pattern; read the object.**

The desk and phone surfaces are gone — one responsive `app.html` replaced both.

**Inside a story — six panels**, rearranged 2026-08-24 at Seth's direction:

| | holds |
|---|---|
| **Story** | the book: title, genre, premise, setting, point of view, who you are, style, register, export, delete |
| **Chapter** | the one you are writing: its name, how it must end, where the story is going, what it proposed for the ledger, the summaries in context, its branches, and closing it |
| **Threads** | every card in this story, grouped by kind — characters, lore, items, rules |
| **Context** | what the model is about to be sent, and why each block is in or out |
| **Search** | prose, entries and summaries |
| **Storyteller** | sampling, activity, the model |

This replaced eight rows in which the chapter's business was spread across four — Story & chapter,
Trajectory, What the chapter added, Branches — and lore had no home inside a story at all, because
`cast` showed characters only and the Worlds page answers a different question (every story at
once). The Inspector button came off the top bar: it opened the panel the nav row already opens.
The context reading stays there, because nothing else shows it and "No room" is a refusal the
writer has to see.

Retired names still resolve. `#<story>/inspector|cast|traj|queue|branches` map to the panel that
absorbed them, in `readHash` — **before** the validity check, not after, which is where the first
attempt put it: the check is against the current titles, so a retired name was dropped to null and
silently replaced by the default panel, and the alias was dead code for the one case it existed for.

**Two panels are not nav rows** and open by clicking a thing: the ledger entry editor, and history.

**Outside a story — five pages**: My stories, Create a story, Worlds & lorebooks, Import, Preferences.

**The mode set was replaced on 2026-08-24** at Seth's direction: Continue, Speak, Act, Direct,
Narrate. The measurement above it — all four of Co-Write, Direct, Full Auto and New Scene
exercised live, 1,290 / 1,218 / 772 / 781 chars, MODE present in every one — was true of the old
set and is kept as the record of it. **The old numbers do not transfer.**

What forced the change: every mode treated typed text as a *directive*, so dialogue the writer
typed never reached the page. The new set turns on that distinction — Direct's text is an
instruction and is never written down; Speak, Act and Narrate put the writer's text on the page
as theirs and the model answers it. `test/ui/model.js` asserts both halves, including the inverse:
that a Direct instruction appears nowhere in the prose.

### A round trip does not carry chapters — surfaced and settled 2026-08-24

Exporting a story and importing it back **flattens every chapter into one**. It has been true
since the importer was written, and nothing said so: the import's own note names branches,
revision history and generation logs as things that do not travel, and never mentions chapters.
Seth's Sutera import landed as one chapter for exactly this reason.

**Settled the same day. Seth: _"the importer works fine, nothing else uses chapters."_** So this
is a decision rather than debt — chapter divisions are not load-bearing for an imported story, and
carrying them would mean deciding what happens to their summaries, author's notes and pins, where
pins name entries whose ids are fresh on the way in. Listed in `NOT_CARRIED` so a round trip's
real behaviour stays visible, not because it is waiting to be built.

`test/import.ts` now asserts, for every story-scoped table found in the schema, that it either
survives a round trip or is on an explicit list with a reason. Of fifteen tables, ten carry a
`story_id`; **three of those travel** — entries, passages, outfits — and seven are listed as
deliberately not carried. `chapters` is on that list marked KNOWN GAP rather than hidden.

The check was written because outfits were dropped the same way — `exportStory` carried them, and
`fromExport` never read them, so a round trip returned every character naked. It is the
persistence version of the guard `test/web.ts` already has for api methods with no caller, and it
fails by name with the counts: `outfits (1 -> 0)`.

### The two importers, resolved 2026-08-24

`src/import.ts` is now the only parser. The client has none: it reads the picked file, sends the
bytes, and renders what the server made of them. The screen that said "Not wired yet" is wired.

What changed to make that possible, and what it cost:

| | before | now |
|---|---|---|
| client-side parsing | two hand-rolled parsers | none — one engine, `src/import.ts` |
| merges into an existing story | client only | `imp.merge`, by entry title |
| AI Dungeon's *current* export | **rejected as unrecognised** | both halves parse |
| a `.db` picked in the browser | impossible (path-only) | written to `imports/`, then read |
| preview before writing | none | `POST /api/import/preview` |
| tested | 7 checks | 9 suite checks + 30 driven UI checks |

**The AI Dungeon parser had never seen a real export.** Measured against genuine files on
2026-08-24: the app now exports one adventure as *two* files — a bare JSON array of story cards
(`keys` as one comma-separated string, `type` in mixed case) and the adventure as markdown with
the player's own turns on lines beginning `>`. Neither is the whole-adventure JSON `fromAiDungeon`
was written for; both were refused. Both now parse, and the `>` marker is what keeps 40 of 357
passages attributed to the writer instead of the model.

Verified end-to-end through the file picker, on the real files: 357 passages (40 the writer's),
5 story cards merged into that same story, prompt assembles at 28,100 of 46,146 tokens with the
imported canon firing from its keys. A chub.ai `spec_v2` PNG imports as its own story.

Two things the merge deliberately does not do: it matches entries by **title** (so re-importing
an edited card updates it rather than leaving two), and it never merges prose by identity —
prose only ever appends. Importing the same adventure twice gives you the prose twice.

### Schema against PLAN-02's P1 list

Substantially complete under shorter names (`idx` for `index`, `summary_hash` for
`summary_source_hash`, `manifest` for `context_manifest`). Genuinely absent: `engine_config`,
`model_config`, `writing_mode` (mode is per-request, never stored), tokenizer-keyed `token_counts`
**maps** (scalars where they exist at all). `tailscale_login` is **no longer absent**: `serve.ts`
resolves one owner per request from `tailscale whois` against an `ANANSI_ALLOW` allowlist, and the
`login` column has an identity behind it as of 2026-08-26.

`system_block_override` and `token_counts` were removed from the schema by the 2026-08-23 ponytail
audit as columns nothing read. They were **P1 stubs for planned features**, so the deletion removed
the stubs, not the features; both remain unbuilt and remain in the plan.

## 3c. The UI overhaul, 2026-08-23

`desk.html` and `phone.html` are **deleted**. One responsive surface, `app.html` + `web/app.js`,
serves `/` and `/phone` — the second mapping kept so an installed home-screen icon still works.
Built from `Anansi App.dc.html` in Seth's Claude Design project, which the repo does not contain.

**Nineteen bugs found and fixed on that surface in one day**, none of which the existing suites
could see. The ones worth remembering as classes:

| class | example | why nothing caught it |
|---|---|---|
| a name doing two jobs | `data-theme` was both the look on `<html>` and a click action, so **every click toggled the rail and repainted** — nothing was editable | the page looked right until you used it |
| guessing a field instead of reading it | Accept sent `decision` to a route reading `accept`, so accepting **rejected**; search read `storyId` from a row carrying `story_id` | the request succeeds and the wrong branch runs |
| a button with no way to be clicked | `#send`, the app's primary action, had no action attribute — mouse-unreachable, and on a phone unreachable at all | nothing throws |
| an engine feature with no surface | deleting desk.js took the only UI for five features this document called Done | the engine, schema and routes were all still correct |
| a repaint eating input | typing in either search box redrew the region and destroyed the input | "brass" simply found nothing |
| the surface asserting what the code denies | Storyteller said sampling was per-story; `gen` is one process-wide object | copy is not tested |

**Each class now has a test rather than a fix.** `test/web.ts` asserts the action names and the
`<html>` state attributes are disjoint, that every button is clickable, and that every api method
has a caller or a written reason for not having one. `test/scope.ts` tests the three OPEN routes
with two owners, since an open route's only protection is its SQL.

**The harness that found them.** `bench/drive.ts` — headless chromium over the DevTools protocol,
no dependencies, that clicks and types. `test/ui/run.sh` runs seven scenarios, each against a fresh
copy of the database because they mutate and poison each other otherwise. An eighth, `model.js`, is
opt-in: every step waits on a real generation.

Honest note on the ratio: across the day the driver produced roughly as many false alarms as real
bugs, and every false alarm was the probe's fault — following an id through `addVariant`, which
moves it; polling a count for a value written after it; `querySelector` returning the first of
several elements, in a tray that was shut. `visible()` exists because a DOM-presence check passing
while the element is `display:none` is how a green assertion lies.

## 4. What got built out of order, and what that cost

PLAN-02's phases were P0 measure → P1 one writer end to end → P2 a week of real writing → P3 two
writers → P4 canon fires → P5 automatic → P6 engine → P7 interop.

What actually happened: **P0 in full**, then a diagonal slice through P1, P2, P4 and P5, then the
whole phone surface (which was P7's second-surface work), then the desktop.

| Skipped in P1 | Consequence |
|---|---|
| ~~Identity, allowlist~~ | **Built 2026-08-26** — whois, `ANANSI_ALLOW`, one owner per request. RLS and Postgres are still not built and are still unscheduled. |
| `pg_dump` / backups | `anansi.db` is the only copy of anything written. |
| ~~Status strip~~ | **Partly built.** The rail says `llama-server asleep` or the real slot size, and Preferences shows the unit's state with stop/restart. Nothing says *busy*. |
| Spark | The empty-story problem SPEC §8.1 names is live. |

| Skipped in P2 | Consequence |
|---|---|
| Export | No way to get prose out. |
| ~~Word count~~ | **Wrong — it exists.** Per chapter at `desk.js:69`, whole-story at `desk.js:77`. Written from memory during the desktop rewrite and never rechecked. |
| Toolbar (curly quotes, scene divider) | `is_break` exists; nothing types one from the editor. |

**The real cost** is not the skipped items — it is that P2's exit criterion was *"Seth writes chapter
one of a real novel in it, for a week, and it is all still there afterwards"*, and three of the four
things that criterion forces in are still missing: revert, backups, and export.

---

## 5. Where it actually stands, and what is next

**P2 is closed.** Its exit criterion was *"Seth writes chapter one of a real novel in it, for a
week, and it is all still there afterwards"*, and the three things that criterion forced in —
revert, backups, export — are all built. Export is now stronger than the criterion asked: a story
leaves as a standalone database, and comes back through `src/import.ts`.

**What is measured and settled**

- The slot is 50,048 tokens per writer, doubled from 25,024 (F13). Two concurrent writers at full
  budget fit with a 5,720-token margin, measured at the real worst case.
- Prose is bounded by the chapter window; 200,000 words fits.
- There is no cache thrash and no per-story session work to do (F16).
- F9 is real but rare — 4.0%, not the 10-20% first measured.

**What is next, in the order it should happen**

1. ~~**The second tenant.**~~ **Done, 2026-08-26.** `tailscale whois` on the peer IP, an
   `ANANSI_ALLOW` allowlist in `login=account` form, one owner resolved per request, and `gen`
   moved off the process onto the owner. `test/scope.ts` is 22 checks; the two new ones prove the
   allowlist refuses the desk itself when told to, and a control proves the 403 is the gate rather
   than a dead server. Still needs the second person actually on the tailnet — all six nodes are
   Seth's.
2. ~~**The F15 confirmation run**~~ — **Done.** F20 ran it at 850 generations per arm and found
   nothing: -0.02 on contradictions, +0.24 on the silver rate. `CANON-REPEAT` was deleted rather
   than left switched off, and `blocks.ts` carries the epitaph.
3. **Activation depth** — secondary keys, `key_logic`, proximity, exclusion, regex. PLAN-03 notes
   this does *not* address F9, since the entry already fires. It addresses multi-word false-firing,
   which is a different and real problem.
4. **The budget engine** — reservation, trim ladder, eviction, `partial` states. Still gated on the
   trigger in PLAN-02 §7.2, which has not fired: nothing has overflowed since the chapter window
   landed. `priority` stays stored and ignored until this exists.
5. **The remaining surfaces** — design screens D9, D10, D14, and the service worker for offline
   read.

**Correction, 2026-08-23.** An earlier pass of this document claimed nothing called `backup()` on a
schedule. That was wrong — `serve.ts:95` runs `snapshot()` on start and every thirty minutes,
keeping twelve, and `backups/` holds them. The claim was written from memory instead of from the
file, which is the exact failure this document's header warns about.

**What is actually true.** Every snapshot lands on the same disk as `anansi.db`. That protects
against corruption and against a bad edit; it protects against nothing that takes the machine or the
disk. `exportStory` can now put one story anywhere, and nothing calls it on a schedule — so
off-machine backup is the open item, not backup itself.

---

## 6. Fourth pass, 2026-08-27 — audited against source again

Both harnesses green first: `test/all.ts` **201 ok in eleven suites**, `test/ui/run.sh` **467 ok in
twelve scenarios, 0 red**. `handlers` came in at 40 this run, so the dropped-CDP death recorded in
`checklist.md` did not recur. Nothing below is a failure; it is all drift and doorless code.

### What this document had wrong

Eight claims, corrected in place above. The pattern in every one is the same: a row went stale when
the feature it described got built, and nothing re-read it. `generations` "never read" outlived
`GET /api/activity` by three days. Two rows named `desk.js` and `phone.html`, files this document's
own §3c records as deleted. Its own next-step list had items 1 and 2 done. **A build-state document
that is only ever appended to reports the past as the present**, and this is the fourth pass to
find that out. `checklist.md` stayed accurate over the same period because it is rewritten rather
than extended.

### Two things doorless in the code, found this pass

**`POST /api/remember` has no caller.** The route is at `routes.ts:1047`, `test/memory.ts` drives it
directly, and `web/api.js` has no method for it — `app.js` has no `fetch` of its own either. So
nothing on any surface re-runs the character-memory pass on a chapter that closed while the router
was down, which is the case the route exists for. This is the failure class §3's correction table
already names, arriving again.

**The guard cannot see it, because it runs in one direction.** `test/web.ts` asserts every method in
`api.js` has a caller in `app.js`. It does not assert that every route in `routes.ts` has a method
in `api.js`. A route born without a client is invisible to it, and that is exactly how this one got
here. Both directions belong in that check.

**And its DEFERRED list has gone stale, which blunts it further.** `rollup` and `delArc` are listed
as deferred with reasons, and both have had callers since arcs got a surface (`app.js:2705`,
`2712`). While a name sits in DEFERRED the orphan check skips it — so if that surface is deleted
again, nothing goes red. `delBranch` is the only entry still true.

### F36 is on no open list

`P0-FINDINGS.md` carries it; `checklist.md` and this file did not mention it at all. Both prompt
halves are in the code (`render.ts:32` for SYSTEM, `prompts.ts:347` for INVENT), and F36's own text
says the result is 0/6 with no before/after — under about 40% and nothing more, which is the F12
mistake with a smaller denominator. The structural half it names has no marker anywhere: the
contradiction checker compares a passage against canon, so a passage that quotes canon while
contradicting *itself* agrees perfectly. Nothing in the pipeline looks for internal coherence.

### The comment that lied about its own debt

`db.ts:165` said `priority`, `sticky_for` and `proper_nouns` were all stored and ignored. Two of the
three had been read by `context.ts` for weeks (`:285` folds around `properNouns`, `:425` holds an
entry open for `stickyFor`). Corrected at the site. A `ponytail:` marker is only worth grepping if
it is retired when the debt is paid.
