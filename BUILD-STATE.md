# Build state — 2026-08-23 (third pass)

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
| Persistence: 8 tables, cascade deletes, partial index on `selected` | `src/db.ts` |
| Variants — regenerate keeps every take, nothing deleted | `db.addVariant` / `selectVariant` |
| Chapters with manual start and end; breaks are real passages | `db.endChapter` |
| Chapter summaries (manual trigger) | `POST /api/summarize` |
| Both surfaces on one engine, one API, one field schema | `web/api.js`, `web/model.js` |
| `generations` logged on every call, including failures | `db.logGeneration` |
| 11 engine tests that run with no model up | `poc/test.ts` |
| Per-story export to a standalone database | `db.exportStory` |
| Import: Anansi exports, AI Dungeon, character cards V1/V2/V3 | `src/import.ts` |

---

## 2. Half-built — schema or plumbing exists, the feature does not

**This is the list that matters.** Each of these looks done from the outside.

| Thing | What exists | What is missing |
|---|---|---|
| ~~Revert~~ | History panel on every passage; restoring is itself kept | **Done.** |
| ~~Summary staleness~~ | SHA-256 over covered prose, recomputed on read; stale summaries excluded from the prompt with a reason | **Done.** |
| ~~Auto-summary~~ | Fires on chapter close | **Done.** |
| **Search** | A `LIKE` scan | Fine at this size. The unused FTS5 table beside it has been dropped rather than left looking like a feature. |
| **Branches** | `branches` table, rows, `branchesOf`, UI entry point | No fork action. The button says so. |
| **`generations`** | One row per call with the full manifest | Never read. P6's own trigger condition (prefill time, prefix moved) depends on reading it. |
| **Entry knobs** | `sticky_for`, `proper_nouns`, `priority` columns | The engine ignores all three. |
| ~~Export~~ | Markdown and JSON, with proper download headers | **Done.** |
| ~~Spark~~ | Idea in, skeleton out, cast proposed as entries, every field editable before accepting | **Done.** |
| ~~Canon violation flags~~ | Runs on accept, flags inline on both surfaces, dismissable | **Done.** F1 0.89 measured — see P0-FINDINGS F11. |
| ~~Extraction~~ | Reads a chapter, classifies new/changed/conflict, queue on both surfaces | **Done.** Nothing is canon until accepted. |
| ~~Canon over time~~ | States anchored to a chapter, resolved at assembly, hide-or-hint before opening | **Done.** Lens 5's ONE THING, with 5 engine tests. |
| ~~Chapter pins~~ | force_in / force_out per chapter, composite FK closes SPEC §7.1's cross-story leak | **Done.** |
| ~~Entry history~~ | Per-field revisions with provenance, restore, on both surfaces | **Done.** |
| ~~Cross-story isolation~~ | One central gate plus scoped writes; 12 checks in `test-scope.ts` | **Done.** The audit found no ownership check on any of 27 routes. |
| **Tests** | **88 across five suites** (33 engine, 25 db, 13 scope, 7 import, 10 web), plus the model evals in `bench/` | Routes are covered only through the client-contract check; no HTTP-level suite yet. |

---

## 2b. The debt ledger

Everything deliberately unfinished carries a `ponytail:` comment at its site, so it is harvested
from the code rather than remembered:

```
grep -rn "ponytail:" poc/src poc/web poc/*.ts poc/*.html
```

**Ten markers as of 2026-08-23.** Each names what is missing, why it was left, and the upgrade path.
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
| `serve.ts` | One hardcoded owner. No Tailscale identity, no allowlist, no second tenant. |
| — | Adventure mode **dropped** (Seth, 2026-08-23), not deferred. Nothing to build. |
| `desk.js` | Design screens D9, D10, D14 not built as surfaces. |
| `phone.html` | Manifest and icon **done** — it installs. No service worker, so no offline read; SPEC §13 M7's warning about workers and streaming POSTs is still unanswered. |

---

## 3. The plan's own phases, against the code

PLAN-02 §9 sets each phase by an exit criterion. Audited against the source, not the phase order —
which is why the picture is lopsided.

**P3 — "Two people write different books at the same time without noticing each other." 20-30h.**
**This is the hole.** Multi-story works and the story `status` field carries draft/finished. Missing:
the second tenant's whole path, the status strip, advisory locks on two writers in one chapter, and
the character wizard. Everything P3 needs *underneath* is built and tested — ownership, scoping,
export — so this is the last structural gap and it is gated on a device, not on design.

**P4 — "A fact pinned in chapter one reaches chapter twenty on its own." 20-30h. Substantially done.**
Entries, keywords, always-on versus triggered, interiority notes, POV force-include, sticky, the live
fire preview (`desk.js` shows the keyword that fired and what it cost), chapter pins — all built.
Missing: full-text search. The FTS5 table that nothing populated was dropped rather than left looking
like a feature; search is a `LIKE` scan.

**P5 — "The ledger fills itself and I trust what it did." 30-45h. Substantially done.**
Extraction under §7.4, the ledger-as-queue with diffs, summary staleness, canon violation checking —
all built. Missing: **memory collect-versus-inject**, which is vector recall. `RECALL` exists as a
block kind, is ordered, tagged and ranked first for eviction, and nothing ever adds to it. It is a
reserved seat, now marked as one in `blocks.ts`.

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

## 4. What got built out of order, and what that cost

PLAN-02's phases were P0 measure → P1 one writer end to end → P2 a week of real writing → P3 two
writers → P4 canon fires → P5 automatic → P6 engine → P7 interop.

What actually happened: **P0 in full**, then a diagonal slice through P1, P2, P4 and P5, then the
whole phone surface (which was P7's second-surface work), then the desktop.

| Skipped in P1 | Consequence |
|---|---|
| Identity, allowlist, RLS, Postgres | Single hardcoded user. The second tenant cannot exist yet, and that was P3's entire criterion. |
| `pg_dump` / backups | `poc/anansi.db` is the only copy of anything written. |
| Status strip | No surface says whether the model is up, busy, or asleep. |
| Spark | The empty-story problem SPEC §8.1 names is live. |

| Skipped in P2 | Consequence |
|---|---|
| Export | No way to get prose out. |
| Word count | Dropped in the desktop rewrite; the design does not show one either. |
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

1. **The second tenant.** Tailscale identity, allowlist, one owner per request instead of the
   hardcoded one in `serve.ts:13`. This is the last structural thing, it gates P3 entirely, and
   every isolation mechanism it needs is already built and tested (13 checks in `test-scope.ts`,
   plus export proving a story can be handed over cleanly). Needs Seth's second device.
2. **The F15 confirmation run** — 850 generations per arm, ~100 minutes unattended on the harness
   that now exists. Either it settles canon repetition or it retires it. Cheap, and the alternative
   is shipping on evidence F12 already proved is not enough.
3. **Activation depth** — secondary keys, `key_logic`, proximity, exclusion, regex. PLAN-03 notes
   this does *not* address F9, since the entry already fires. It addresses multi-word false-firing,
   which is a different and real problem.
4. **The budget engine** — reservation, trim ladder, eviction, `partial` states. Still gated on the
   trigger in PLAN-02 §7.2, which has not fired: nothing has overflowed since the chapter window
   landed. `priority` stays stored and ignored until this exists.
5. **The remaining surfaces** — design screens D9, D10, D14, and the service worker for offline
   read.

**The one thing with no ticket.** `poc/anansi.db` on one machine is still the only copy of anything
written. `backup()` and `exportStory` both exist; nothing calls either on a schedule.
