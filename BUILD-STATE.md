# Build state — 2026-08-23 (second pass)

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
| **Tests** | 46 across three suites, plus two model evals (`bench/compliance.ts`, `bench/checker.ts`) | Routes are covered only through the client-contract check; no HTTP-level suite yet. |

---

## 2b. The debt ledger

Everything deliberately unfinished carries a `ponytail:` comment at its site, so it is harvested
from the code rather than remembered:

```
grep -rn "ponytail:" poc/src poc/web poc/*.ts poc/*.html
```

Fifteen markers as of 2026-08-23. Each names what is missing, why it was left, and the upgrade path.
Nothing in this list is a surprise; the point is that adding to it requires writing down the ceiling.

| Where | What is unfinished |
|---|---|
| `render.ts` | **F9** — the title in SPINE beats a triggered entry 10-20% of the time. Measured, unfixed. |
| `prompts.ts` | The checker misses numeric contradictions. One case in twelve. |
| `context.ts` | Word folding, sticky windows, proper-noun exemption and POV force-include are **done**. Still missing: secondary keys, `key_logic`, proximity bound, exclusion keys, regex keys — all of which address multi-word false-firing. |
| `context.ts` | No budget engine — ceilings and a hard refusal only. No reservation, trim ladder, eviction, or `partial` state. |
| `db.ts` | SQLite, not Postgres. No pgvector, no RLS. |
| ~~`db.ts`~~ | **Done.** Copy-on-write forking, branch switching, discard. Every read follows the active branch. |
| ~~`db.ts`~~ | **Done.** `arcs` collapse a run of chapters into one act-level summary; covered chapters stop being sent. |
| ~~`db.ts`~~ | **Done.** `notes` is editable on both surfaces and unrenderable by construction — the engine's `Entry` type has no such field. |
| `db.ts` | `priority` is still stored and ignored — it needs the budget engine to mean anything. `sticky_for` and `proper_nouns` are now used. |
| `db.ts` | Search is a LIKE scan. |
| ~~`routes.ts`~~ | **Done.** `GET /api/activity` reads it; Preferences shows prefill seconds and rate per call, which is PLAN-02 §7.2's trigger made observable. |
| `serve.ts` | One hardcoded owner. No Tailscale identity, no allowlist, no second tenant. |
| — | Adventure mode **dropped** (Seth, 2026-08-23), not deferred. Nothing to build. |
| `desk.js` | Design screens D9, D10, D14 not built as surfaces. |
| `phone.html` | Manifest and icon **done** — it installs. No service worker, so no offline read; SPEC §13 M7's warning about workers and streaming POSTs is still unanswered. |

---

## 3. Not started

**From the design canvas** — D9 chapter close as its own screen, D10 flags, D14 first run; and on
the phone: Progression (27), Extraction queue (28), Canon flags (30), Summaries (29) as a screen.

**From the engine spec** —
canon violation checking (§8.4); extraction into the ledger (the prompt is written in
`src/prompts.ts` and has no route); activation beyond plain keyword — secondary keys, `key_logic`,
proximity, exclusion, regex, sticky, POV force-include; the budget engine's trim ladder,
reservation, eviction and `partial` states; vector recall; universes.

**From the plan's infrastructure** — Postgres, RLS, Tailscale identity, the allowlist, the second
tenant, `pg_dump` backups, dev/prod split, the status strip, the no-op service worker.

---

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

## 5. Suggested order from here

1. **Close P2 properly.** Revert UI over the revision tables, `pg_dump`-equivalent backup, export,
   and the summary-staleness comparison. Roughly a day, and it makes the thing safe to write in.
2. **Auto-summary on chapter close**, so §7.1's context bound actually holds without discipline.
3. **Extraction + the queue** (design screen 28). The prompt exists; it needs a route, the
   new-entries-only rule from §7.4, and the ledger badge.
4. **Progressions** (design screen 27). Lens 5's ONE THING, and it gets harder after placement exists.
5. ~~Chapter pins~~ — done. Note the correction in PLAN-03: they do *not* address F9.
6. **The second tenant**, or **activation depth** — see PLAN-03. ← next
6. Then P3 (identity, allowlist, second tenant) or P4 (activation depth) depending on whether the
   second writer is waiting.
