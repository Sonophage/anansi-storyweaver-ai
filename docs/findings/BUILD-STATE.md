# Build state — 2026-08-28 (fifth pass)

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
| **Tests** | **235 across eleven suites** (44 engine, 53 db, 33 scope, 12 import, 13 stream, 8 mend, 8 memory, 4 report, 14 talk, 18 web, 33 app) — **240** — plus **488 driven-browser checks across twelve scenarios** (16 buttons, 60 surfaces, 40 handlers, 18 search, 13 restored, 14 hostile, 11 limits, 35 import, 58 modes, 153 panels, 52 phone, 18 wizard), all green on 2026-08-28 — plus `model` and `ritual`, which wait on real generations and are not in the default set — and the model evals in `bench/` | No HTTP-level suite yet. The client-contract check **now runs both ways** (`test/web.ts:217`): every `api.js` method needs a caller in `app.js`, and every route in `routes.ts` needs a method in `api.js` or a named entry in `NO_CLIENT`. The one-direction row above was true until 2026-08-27 and is the reason `POST /api/remember` shipped doorless. |

---

## 2b. The debt ledger

Everything deliberately unfinished carries a `ponytail:` comment at its site, so it is harvested
from the code rather than remembered:

```
grep -rn "ponytail:" src web bench *.ts *.html
```

**Twenty-four markers as of 2026-08-28**, counted by grep, not recalled: `routes.ts` 6, `db.ts` 6, `app.js` 3, `context.ts` 3, `serve.ts` 3, and one each in `prompts.ts`, `app.html`, `bench/ledger-audit.ts`. (`.claude/CLAUDE.md` said twenty-one until 2026-08-28; the count had not been run since 2026-08-23.) The ponytail audit of 2026-08-23 cut two phantom block kinds, two unread columns and a retired harness, and added one: `/api/import` was the only route in the tree with no caller. That one is gone again — the Import screen calls it now. One was added with rejected takes: the flag is recorded and shown but not sent to the model, because feeding a rejected take to the prompt is a prompt change and F20 is what those cost to justify. Each remaining marker names what is missing, why it was left, and the upgrade path.
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

**Superseded 2026-08-28.** Both halves are built and are in `serve.ts`: a six-hourly copy of the
whole database to `/data/anansi-backups` keeping fourteen (`:285`), and a daily per-book
`exportStory` to `/data/anansi-books` (`:314`). Neither survives losing the machine, which is said
at the site. See §7 for the defect this shipped with and how it was closed.

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

---

## 7. Fifth pass, 2026-08-28 — the day and a half the fourth pass could not see

`test/all.ts` **235 ok in eleven suites** at `b371eaa`, run before this section was written, and
**240** at the end of the session — 2f, then 2a and 2d, then 2b and the 2e guard. The browser
harness was run in full at the end: **488 ok in twelve scenarios, 0 red**, up from the 477 recorded
at `b371eaa`. The
browser harness ran in full at the end of the session: **488 ok in twelve scenarios, 0 red**, up
from the 477 recorded at `b371eaa`; `modes` moved 49 → 58 over the period.

The fourth pass ended at `0640cb8`. Twenty commits landed after it, and none of them reached this
document. That is the drift its own §6 predicted, arriving on schedule, and it is the second thing
worth reading in this section.

### The three doorless findings of §6 are all closed

Checked in the source, not in the commit messages that claim them:

- `POST /api/remember` has a door — `web/api.js:126`, pressed from `web/app.js:1508`. The comment
  above the button records the three days it was reachable from nowhere.
- The client-contract guard runs both ways — `test/web.ts:217` onward. A route with no `api.js`
  method is now a red unless it is named in `NO_CLIENT` with what does drive it (`/api/check`,
  driven by `bench/checker.ts`, is the only entry).
- `DEFERRED` is down to `delBranch` alone. `rollup` and `delArc` are out, and the comment above the
  list now says why a stale name there is a hole rather than a note.

The §2 Tests row has been corrected for all three.

### What landed, and is load-bearing

Verified against source; the commit each came in with is named for the argument, not as evidence.

| | Where |
|---|---|
| Off-disk backup, six-hourly to `/data/anansi-backups`, keeping fourteen | `serve.ts:285` |
| Per-book export to `/data/anansi-books`, daily | `serve.ts:314` |
| Contradiction **muting**, keyed on the chapter, dropped before the model is asked | `db.mutedIn`, `routes.ts:475` |
| A **Waiting** panel: proposals, unpaid promises, flags, each linked to where it lives | `60ee4cb` |
| The cover behind the prose, per-story strength 0–100, clamped in `updateStory` | `db.ts:1054`, `cover_opacity` |
| Portrait covers, 3:4, downscaled 1100×1600 | `848d025` |
| A chapter names itself when it opens — title and beat proposed, neither saved until Save | `POST /api/chapter/propose` |
| "Remember this" — point at a passage, it becomes a thread, as facts and as a proposal | `d206456` |
| "What changed" — release notes Anansi writes from the commit log, cached on the sha, accumulating | `db.newestNoted`, `release_notes` |
| The context bar full-width under the header; running head and ⋯ handle deleted | `493f745` |
| The veil over the reading column only, so Stop stays reachable | `f4fd312` |
| The seam pin: scroll to the end of the previous passage with 72px of peek | `f4fd312` |
| The composer grows rather than moves; hardware-keyboard preference, per device | `062dccd` |
| Spark and thread lengths raised, with the token ceilings raised in the same commit | `7b49bf7` |

`chapter_sticky` was reused rather than orphaned: it meant a sticky heading for one afternoon and
means the backdrop now. Nothing had set it yet, so there is no migration.

### Two things this pass changes in §5's "what is next"

**Off-machine backup is no longer the open item.** §5's closing paragraph was true when written and
is now superseded in place. What replaces it is narrower and is written at the site: `/data` is a
different device, and neither copy survives losing the machine.

**And it shipped with a defect that is worth keeping visible.** Both `/data` paths are fixed
absolute paths, and every server that booted wrote to them — including the twelve throwaway servers
`test/ui/run.sh` starts per run. That put 167 fixture exports into `/data/anansi-books` and rotated
thirteen of fourteen off-disk slots to 274 KB test fixtures, evicting the real copies. Fixed at
`b371eaa`: a server whose database is not the primary library skips both and says so once,
`resolve()` on both sides. The near backups were never touched, because those live beside whichever
database is open. **The shape of it — a feature that is correct in the app and wrong in the harness
— is not covered by either harness**, and nothing added this pass covers it either.

### F37, and what it does to the register question

F37 reversed under its own control arm and the reversal is the finding. The clause making the voice
field authoritative measured **98.0 against a control that kept the demand and dropped the clause:
98.0**. It bought nothing and was deleted. What moves the number is how the rule is *written*: the
same rule buried in an 812-character line bought 3/28 against a 9/39 baseline; on its own line,
naming narration with the forms spelled out, 42/43 — and it holds at 97.7% against sixteen passages
of prose that contradict it. `DEFAULT_VOICE` still says nothing about contractions, deliberately.

This is the second time a prompt clause has measured flat against its own control (F20 was the
first, and `CANON-REPEAT` was deleted for it). Both are in `P0-FINDINGS.md`.

### PLAN-06 §2f, closed in this session

The write path every route reaches did `Array.isArray(e.keys) ? … : []`, so a model or an API
client posting `"coat, iron bridge"` lost both keys and the entry looked perfect — triggered, with
nothing that can trigger it. One parser now, `db.keysOf`, with SPEC §7.1's 2-32 bound and a `cap`
parameter (`import.ts` asks for eight, the app takes ten).

It was **unassertable before it was unasserted**: every fixture in the repo handed `keys` in as a
pre-built array, which is the one shape the old code got right. The bound then made a second defect
reachable — `fromCard` set a lorebook entry's activation from `constant` alone, so an entry whose
keys did not survive imported as triggered-and-unfireable — and the new assertion caught it rather
than a person. Both fixed; all four assertions falsified against the restored code.

### PLAN-06 §2a and §2d, closed in the same session — and the meter needed neither

`/api/manifest` has done a `/tokenize` round trip and returned `exact` beside the manifest since
the route was written; `app.js` never read it. The bar drew `totals.used` — the estimate — and
carried both defects at once, measured together at **1.28x** by `bench/drift.ts`. The generate path
was always right (`routes.ts:258` overwrites `totals.used` with the same count), so the bar was
exact after a generation and 1.28x out on the next repaint, which is why it never read as a fixed
offset. **The bar uses the tokenizer's answer now.** Three lines, no constant involved.

The estimator keeps one job — the ceilings and the refusal inside `buildContext`, which are pure
and cannot make a round trip. **2.8 → 4.2**, chosen under the lowest rate any model measured (4.28,
`rp-t-glm47flash-h`) rather than at the 4.45 median of the model in front of us, so it errs high
for every model in the log instead of exact for one and low for another. 2d is taken off the budget
rather than added to the blocks, on `context.ts:548`'s own argument. What 2d fixes is narrow: the
6% margin was already absorbing SYSTEM, so nothing was overflowing — the **number** was wrong.

**Two more fixtures were found unable to see the thing they guarded.** `test/db.ts` divided a
fixture by 2.74 and compared it to an estimate dividing by 2.8 — it asserted the constant against
itself and reported "within 15%" while the estimator was 59% out. `test/app.ts`'s manifest fixture
had `used` and `exact` set to the same number, so no check could tell which one the bar read. Both
now carry measured values that differ. That is the third and fourth instance of this family, after
the tag-splitting fixture and the canon-per-take chain.

### The re-verification pass, 2026-08-28 — what did NOT need building

Run before starting the next item, on the rule that this repo's recurring failure is finished code
nobody can find. Three of the four things on the list were not what the plan said they were:

- **PLAN-06 §2c is already built.** `extract` calls `narrationOnly(...)` and has since `844f99b` on
  2026-08-27; `checklist.md` records it under that day's work, citing §2c by number, and §2c never
  noticed. Its line reference now points at a one-line route handler rather than at the read. It
  was two commits from being re-implemented on top of itself.
- **§2e's second cause is half stale.** `routes.ts:1336` already differentiates on accept —
  `p.entry_type === 'character' ? 'always_on' : 'triggered'` — so accepted lore, items and rules
  land triggered today. What it does not do is check whether they have keys.
- **§2e's fix is smaller than §2e says.** It calls for the rule at "the three proposal sites";
  there are **six** callers of `upsertEntry` and all of them funnel through one function, which is
  where `keysOf` went the same day for the same reason. One guard at the bottom, not three at the
  top.
- **§2e also has a conflict that has to be settled first.** `app.js:3964` creates
  `triggered` with no keys deliberately — an entry made from a highlight would otherwise cost
  tokens on every call before anyone finished it. The same state means "dark by accident" at five
  sites and "not switched on yet" at the sixth. A blanket guard breaks the deliberate one.
- **And its probe has run.** `bench/ledger-audit.ts` against the live library: of the 7 entries the
  prose can answer for, **1 would go dark**, **2 of the 6 "safe" fired only in the past and not on
  the live window**, and **4 of those 6 rest on a story with fewer than four selected passages**.
  Flipping the existing twelve is not supported by this. A guard on new writes is.

`bench/utilisation.ts` and `bench/ledger-audit.ts` both exist; `checklist.md` said neither did, and
now says otherwise. `utilisation` has still never been run, so "does the ledger do any work" is
open.

**§2b — fixed the same day, the smaller way.** Every DIRECTIVE part is
`keep: true`, so `addAnchor`'s flex string is empty and the shortening branch returns every part
unchanged — while still calling `add(...)` with `anchor shortened to ${cap} tokens`. The write-up
offered "give one part `keep: false` or stop writing the false reason". The second was taken: it is
one line and loses nothing, where the first changes what reaches the model. An uncuttable anchor
over its cap now says so; a real cut still reports itself. The existing lockout fixture already
reproduced the lie at 355 tokens against a cap of 250 and nothing had read the reason.

**§2e — the guard is built; the flip is not.** `upsertEntry` turns a keyless `triggered` entry
always-on unless the caller passes `allowNoKeys` or the row is already dark. One floor rather than
three call sites, beside `keysOf`. `web/app.js:3964` passes the flag, and `test/ui/search.js` has
been asserting that deliberate behaviour all along — it goes red in a real browser when the flag is
dropped, which is how the opt-out was verified instead of assumed. Causes i, iii and iv of §2e are
still open: nothing yet makes an entry *fire*.

### The browser harness caught what 240 unit checks could not

The 2e guard shipped green on `test/all.ts` and turned `handlers` red on the next full browser run:
*"switching activation to triggered persists (now always_on)"*.

The guard was bouncing the writer's own activation chip. And the trigger-words field is **disabled
while an entry is always-on** (`app.js:2233`), so switching to triggered and then typing keys is the
only route there is — the guard had made a triggered entry **impossible to create by hand**, while
every unit check stayed green because none of them presses a chip.

Fixed by naming what the guard is actually for. The defect 2e describes is **silence** — an entry
going dark with nobody choosing it — so `allowNoKeys` now marks the three writes where somebody did
choose: the highlight-to-thread button, the activation chip, and the entry editor's Save. What is
left guarded is what 2e was ever about: accept, the wizard, both importers, copy-to-another-book,
and any API client that did not say it meant it. And because a writer can now legitimately sit in
that state, the hint under the keys box says so: *"This entry cannot reach the model yet."*

This is the case for the twelve scenarios existing. A unit suite cannot press a chip that is
disabled by the state the press is meant to change.

### `bench/utilisation.ts`, run at last — and it narrows the recall question

61 of 347 prose generations can be scored (147 still hold a manifest, 132 are tied to a passage, and
**70 of those name a passage that no longer exists** — takes deleted after the fact, which caps this
instrument's denominator from here on). Detector green first, 9 cases.

**PROSE is 59.8% of the prompt and is lifted verbatim in 37.3% of calls.** SPINE 10.6%, VOICE 8.4%,
TAIL 5.8%, DIRECTIVE 5.3%, CANON-ALWAYS 5.2%, MODE 3.0%, EARLIER 2.0%. **CANON-TRIGGERED and STRING
were never sent at all** — not a low rate, absent, in all 61.

Two readings this does NOT support. Canon's zero lift is not canon failing: SYSTEM tells the model
not to reuse canon's wording, so the zero is F36's rule working, and the tool measures echo rather
than use. And **"2e makes the prompt smaller" does not survive it** — the prompt is 60% prose and
canon is 5%, so making the triggered tier fire buys precision, not size. That was PLAN-06's framing
and this file repeated it; it is corrected at the site.

What it does settle: nothing here justifies another retrieval tier. The prompt has room, the model
demonstrably uses the prose in it, and the selective tier that already exists has fired zero times.

### The story-model select could not clear the one pin that needed clearing

`The Shadow's Debt` is pinned to `rp-t-glm47flash-h`. The router's preset list was rewritten on
2026-08-27, so no option in the select carried that value, **nothing was selected**, and the browser
fell back to showing the first option — "Default" — while the hint underneath still said the story
was pinned. Choosing Default then fired no `change` event, because from the browser's side the value
had not changed. The press worked and the result did not.

`test/ui/panels.js` §15 drives that select and could not see it: it pins a model the router DOES
offer, which is the case that always worked. The state cannot be reached through the API either —
`POST /api/story` refuses a model the router does not serve — so the only way in is to have been
pinned before a rename. The option list moved to `modelOptions` in `web/model.js` so it can be
checked without a browser at all.

**The pin is still in the database.** The fix makes it clearable; it does not clear it.

### A fifth inert-check instance, in a check written this session

`test/app.ts`'s `ok()` takes a message only — assertions run inline above it — while `test/db.ts`,
`test/engine.ts` and `test/stream.ts` take a callback and call it. The same name means two things
across the eleven suites. A check for the select above was written in the callback style, and it
printed green while its body never ran; three deliberate breakages of the code under test all came
back green before that was noticed. All seven message-only suites now throw on a second argument
instead of swallowing it.

The lesson is not the guard. It is that the falsification pass is what caught it, and a green suite
would not have.

### Still open, unchanged by any of the above

§5's items 3, 4 and 5 are untouched: activation depth, the budget engine (still correctly gated —
§7.2's trigger has not fired), and D9/D10/D14 plus the service worker. F36's structural half still
has no marker anywhere. `delBranch` is still the one honest `DEFERRED` entry.

### What this pass did not fix, and is a finding

**`checklist.md` has started to drift too.** Its heading still says *"after a day's work on
2026-08-26"* over a body that covers 08-27, and its debt section still says **twenty-one** markers
where the grep says twenty-four. Its measured counts were corrected to 235 in this pass; the debt
heading was left alone on purpose, because the paragraph under it enumerates *"the other fifteen"*
by name and raising the count without naming the new ones would make it less true, not more. It
needs the rewrite that has kept it accurate, not an edit.

So the fourth pass's lesson does not survive contact: **an append-only document drifts, and a
rewritten one drifts more slowly — it does not stop.** What actually held over this period was the
`ponytail:` ledger and the two harnesses, because both are *derived* — you run them and they answer.
Every count in this section that could be derived was derived. The rest is why the fifth pass exists.

