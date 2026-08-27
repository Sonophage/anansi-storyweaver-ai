# Plan 06 — memory, recall, and the crowded scene — 2026-08-27

> **STATUS: PROPOSAL, with a measured section.** §1 and §2 were read off `src/` and off `anansi.db`
> on 2026-08-27 and are checkable — every number names where it came from. §3 onward is argument and
> proposed work, and nothing in it has been measured. Where this disagrees with the source, the
> source wins and this is the bug.
>
> Nothing here is implemented. §3's three recall options are deliberately unbuilt pending a read of
> §3's commonality.

Written to answer three questions: how recall works now, how to make the story hole-free, and **how
well the harness handles about four characters in one scene.** The stated concerns are context and
writing quality.

The harness is in good shape. `buildContext` is pure, capped, evicted in a defensible order, and
every choice carries the finding that bought it. This is not a list of things done wrong. It is
where the harness has no instrument, plus four defects found by reading the code against the real
database.

---

## 1 · What one generation actually sends

Ten block kinds in `ORDER` (`src/blocks.ts:24`). Caps: SPINE 400, VOICE 500, DIRECTIVE 250.
Ceilings: canon 45%, EARLIER 25%, PROSE 60%. TAIL, STRING, SPINE, VOICE, DIRECTIVE and MODE are
never evicted.

Read off the most recent prose generation in `anansi.db` — mode `speak`, 30 passages,
`prompt_tokens` 5,874, budget 46,446, 9.1 s:

| block | est. tokens | count | share |
|---|---|---|---|
| PROSE | 6,913 | 23 passages | 79.7% |
| TAIL | 467 | 1 passage | 5.4% |
| SPINE | 348 | 1 | 4.0% |
| VOICE | 347 | 1 | 4.0% |
| CANON-ALWAYS | 291 | 2 | 3.4% |
| CANON-TRIGGERED | 0 | **0 — nothing fired** | — |
| DIRECTIVE | 209 | 1 | 2.4% |
| MODE | 101 | 1 | 1.2% |
| SYSTEM (**not counted in the manifest**) | ~445 real | — | ~7% on top |

**Story-so-far is 85% of the prompt. All canon together is 3.4%. 37,770 tokens went unallocated.**

That table reframes both concerns. Context is not scarce — it is nearly empty, and P6's trigger
still has not fired, so the budget engine is correctly unbuilt. Whatever goes wrong in a crowded
scene, **it is not that the model ran out of room.**

Recall, stated plainly: the current chapter and the two before it whole (`wholeFrom =
currentChapter.index - 2`, `src/context.ts:435`), everything older as a ≤180-word chapter summary or
a 220-word arc, plus ledger entries firing on an 8-passage window plus the directive. TAIL is always
exactly one passage on this book, so DIRECTIVE lands one passage above the end rather than the 220
tokens `story.ts:154` intends.

---

## 2 · Four defects. These are bugs, not judgement calls.

### 2a · The token estimator runs 30–48% high on real prose, and its comment says the opposite

`src/story.ts:101` is `Math.ceil(t.length / 2.8)`, with a comment claiming 3.6 measured 24% low.
Against logged rows: 8,676 estimated against 5,874 exact (1.48×); 3,956 against 3,039 (1.30×). Every
ceiling and the in-engine refusal run on inflated numbers, so a long book starts evicting EARLIER
summaries and old passages roughly a third earlier than the slot requires.

**Do not retune the constant blind.** SPEC §7.3 warns that bracket-dense canon bodies run 10–30%
*light* under the wrong tokenizer, so one global constant is wrong in both directions at once — high
on prose, low on the ledger. SPEC §7.5 already specifies the fix and it is unbuilt:

> Verify continuously: compare `manifest.totals.used` against `generations.prompt_tokens` on every
> call and surface the drift. Both numbers are already recorded.

Build the drift report and let it choose the constant. The authoritative guard at `routes.ts:226`
(`await count(prompt)` against `/tokenize`) is unaffected and already correct; it also overwrites
`manifest.totals.used` with the exact figure at `:227`, which is why stored manifests show
`used: 5859` beside a block sum of 8,676.

### 2b · DIRECTIVE's 250-token cap cannot fire, and the manifest says it did

All four parts of the anchor are `keep: true` (`src/context.ts:517-529`), so `addAnchor`'s flex
string is empty and the shortening branch returns every part unchanged — while still stamping the
reason `anchor shortened to 250 tokens`. Reproduced at **274 tokens** with that reason attached.

Harmless at today's size. It would hide a real overrun the moment the block grows, and the F28
lockout already added ~78 tokens to it. Either give one part `keep: false` or stop writing the false
reason; a manifest that lies about its own trimming is worse than one that reports an overrun.

### 2c · `extract` reads raw prose while `remember` strips dialogue

`remember()` passes `narrationOnly(...)` (`src/routes.ts:293-327`). `POST /api/extract` passes
`p.body` raw (`src/routes.ts:1046`). CLAUDE.md's rule is unambiguous — every quality check strips
quoted spans first — and `EXTRACT`'s own prompt says *"A character lying or being wrong is not a
fact"* while the code hands it the lie.

Two contradicting patterns; `remember`'s is the tested one. Rule 7 says pick one and flag the other,
not blend them.

### 2d · `manifest.totals.used` excludes SYSTEM

`render` prepends SYSTEM and `routes.ts:239` slices exactly that many characters back off to send it
as the system role. So SYSTEM — 1,872 chars, ~445 real tokens of standing instruction — is on the
wire but invisible to the manifest and to the on-screen Context meter, which under-reports every
call by a fixed amount. The exact guard counts the whole string, so only the meter is wrong.

---

## 3 · Recall: the three options, and what they have in common

### Option A — auto-propose entries on chapter close

**Change.** `POST /api/chapter/end` (`src/routes.ts:573-579`) already fires `summarise` and
`remember`, each flag-gated with `!== false` and wrapped in its own try/catch so a chapter can close
with the model down. It does **not** fire `extract`. Add a third on the same terms. About five lines;
the route already exists at `:1040`.

**After.** The ledger grows as the book grows without the writer remembering a button. This matters
more than it sounds, because **the ledger is the only tier that survives compaction** — prose falls
out of the two-chapter window, summaries get rolled into arcs, and entries are re-sent on every call
forever. F17 measured this role at 10/10 on all three planted entities with 0.3 spurious proposals
per run: the best-measured role in the app, sitting behind a manual button.

The precedent is already written in the code that would be edited (`routes.ts:571`):

> Summarise on close rather than on a button nobody remembers. Summaries are what bound the context
> without the budget engine; leaving it manual leaves the bound optional.

That sentence applies to extraction word for word.

**Cost and risk.** One more model call per chapter close, and a proposal queue to work every chapter.
The `proposals_dedupe` partial index hashes the subject rather than the wording, so a re-run does not
propose the same character twice. Nothing becomes canon without acceptance. The real risk is F36's:
more always-on bodies in every prompt is more finished English available to be lifted.

### Option B — a keyword RECALL block over old passages

**Change.** Restore `RECALL` to `ORDER`, fill it from `db.search()` (`src/db.ts:933` — already
written, owner-scoped on all three branches per F19, a three-way UNION over prose, entries and
chapter summaries, LIMIT 60), keyed on terms from the directive and the last passage, excluding what
is already in the PROSE window and anything `force_out`. Because `buildContext` is pure, the search
runs in `story.ts` above the line and arrives through `Input` — the same seam `strings` uses.

**After.** Two or three extra `<recall>` blocks of ~200 tokens, `firedBy: ['search']`. Old passages
can come back.

**Cost and risk.** The term-extraction heuristic *is* the feature, and it is the same class of
heuristic that just failed. A LIKE scan returns lexical co-occurrence — precisely what produced
`iron bridge` on *"The bridge was iron, and it was cold"* and `Kade Ashford` on Kade Ferrin plus Lord
Ashford two passages apart, for a character not in the scene. This would reintroduce, in a new block,
the bug `KEY_SLACK = 2` was built to fix. SPEC §7.6's warning is written about vectors and applies
here verbatim: *"a vector layer hides trigger bugs behind plausible recall."*

### Option C — Postgres and pgvector

**Change.** Everything. `node:sqlite` to a Postgres driver — a dependency, which CLAUDE.md forbids
adding without asking — 18 tables migrated, `halfvec` columns on passages and entries, an embedding
model pinned and recorded per row with a re-embed on change, and the situating-header prefix computed
at embed time.

**After.** SPEC §7.6 as designed: K=3 cosine over the last two passages, filtered to `selected = true`
AND the current branch, excluding anything already in context or `force_out`. The situating header —
chapter title, the summary's first sentence, the POV character — is the part that makes it work
rather than merely run.

**Cost and risk.** The largest item in the backlog, and it breaks the zero-dependency constraint.
SPEC gates it at M6 behind *"the keyword path must work on its own first"*, and BUILD-STATE lists
Postgres/pgvector/RLS as **never scheduled**. This is a platform decision wearing a recall
decision's clothes.

### The commonality

**All three add material to a prompt whose problem is not scarcity.** From §1: 8,676 of 46,446 used,
canon 3.4% of the prompt, 37,770 tokens unallocated, and nothing has overflowed since the chapter
window landed. None of the three is blocked by space and none competes for it.

What all three are blocked by is one absence: **nothing can tell you whether a block that reached the
prompt did any work.** The manifest records what was sent and why it fired — `reason`, `firedBy`, per
block — and nothing has ever read it back against the prose to ask whether the prose used it. So:

- **A** ships and you cannot tell whether a richer ledger improved the book or only added exposition
  pressure and more phrases to lift.
- **B** ships and you cannot separate a real recall hit from `iron bridge`.
- **C** ships and, by SPEC's own warning, hides trigger bugs behind plausible recall.

This is the shape of F15 → F20: a plausible context change that cost 850 generations per arm to prove
was worth −0.02 points on contradictions. And it is the shape of COUNCIL-04 #7 — *all 46 entries
fired for an eight-person scene, 2,566 of 46,146 tokens.* **The budget was never the constraint.
Precision was.** A recall tier added to a prompt that cannot yet say who is in the room makes
precision worse, not better.

**The instrument is nearly free, and that is what makes this actionable.**
`generations.manifest` stores every block whole — `kind, id, text, tokens, state, reason, firedBy` —
for the newest 200 calls (`db.ts:1336` nulls the rest), and `tieGeneration` joins it to the accepted
passage. `bench/quote-detect.ts` already scores weighted 3-gram overlap between a canon body and
prose, at a threshold that was measured rather than chosen (n=3 is safe only because of the weight
rule) and with its own both-direction cases. Point `quoted()` at **every** included block instead of
only canon bodies and the result is block utilisation per generation: which blocks the prose drew on,
which were dead weight, which got lifted verbatim.

Verified on 2026-08-27: **110 prose generations in `anansi.db` have both a stored manifest and a tied
passage.** A baseline is available today with no generation run at all.

**Recommendation.** Build the utilisation probe, read the baseline off those 110 rows, then decide.
The expectation — stated here so the probe can falsify it — is that canon at 3.4% of the prompt is
doing very little work, which would argue the next win is **precision and presence**, not another
retrieval tier. A is worth doing on its own merits whenever the queue is wanted. C should be decided
as a platform question and not in order to get recall.

---

## 4 · About four characters in one scene

**It has never been measured, and the one adjacent number is a failure.**

What exists for a crowded scene:

- **A cast mechanism does exist.** `setupPanel()` (`web/app.js:1520`) ticks characters when a chapter
  starts and each tick becomes a `force_in` pin. Its own comment: *"who is present is a force_in pin,
  which is what pins are actually for."*
- **No block ever states presence.** A pin injects that character's canon body and nothing else.
  Across all ten `Kind`s, nothing enumerates who is in the room, who is absent, where anyone stands,
  or who holds what. A character who left two passages ago still holds `stickyFor` 3 and arrives in
  the prompt **identical** to the one currently speaking.
- **Canon renders as an unlabelled wall.** `render.ts` emits `b.text` only — the entry title is never
  sent. Names reach the model solely because bodies are bracket-form `[Name: …]` by convention, and
  23 consecutive canon blocks share one `<canon>` tag with nothing separating them.
- **Every per-character instruction handles exactly one person.** The lockout names one. `speak` and
  `act` interpolate one `speaker`. And `passages.speaker` is a real, populated column that already
  reaches `buildContext` through `Input.passages` — which never reads it. It is not even declared on
  the `Passage` interface (`src/context.ts:31`).
- **The one pass built for four characters is the memory pass.** `MEMORY_TOKENS = 1800`, sized
  because *"four characters at 600 characters each is the shape to leave room for"*
  (`routes.ts:113-116`) — chapter-close only, and it tracks what a character *is*, never what they
  *know*.

The measured evidence, such as it is:

- **COUNCIL-04 #7** — the only number about a crowded scene: all 46 entries fired for an eight-person
  scene, 2,566 of 46,146 tokens. A precision finding. Never re-measured after `KEY_SLACK` landed.
- **F28** — the model **re-genders characters**. The fixture was rebuilt with one man in it, Marek and
  the collector Sabel both written as women in canon; Sabel came back as *"the hem of his coat… He
  stopped inches from the awning's edge"*, and the second man was back in the scene.
  `bench/lockout.ts:23-38` states the limit outright: *"Two men in a scene makes bare 'he' ambiguous
  and no regex resolves it… this measures a one-man scene, and prose with two men in it is not
  covered by it."*
- **F17** — single-character voice is the harness's strongest result: 55 spoken lines across 19/20
  runs, canon capping her at 8 words, longest exactly 8, median 3, zero violations. The model holds a
  hard per-character constraint when there is one character to hold it for.

So everything the harness does well for one character, it does **with no help at all** for four. The
re-gendering was found as an obstacle to measurement, never measured as an effect.

There is also no per-character knowledge state anywhere — `entry_states` tracks what a character is,
and F17 measured that working end to end. Asymmetric knowledge, which is what eats multi-character
scenes, has no representation. PLAN-04's relations field was shelved 2026-08-26 in favour of the
character memory, and SPEC §15 gap 2's relations graph is deferred.

---

## 5 · The work, in order

### Phase 1 — two probes. Detectors need no model.

**`bench/cast.ts`.** Synthetic fixture: four characters with distinct, lexically checkable canon — a
stated gender each, an 8-word speech cap on one (after F17's success), a fixed location, one object
each. Detectors, each shipping both-direction synthetic cases and refusing to be believed until
green, per the discipline every classifier in `bench/` already follows:

- **pronoun/gender flip** against canon gender, narration only
- **absent-character speech** — dialogue attributed to someone the fixture places elsewhere
- **cast drop** — a present character who never appears in a generation
- **object or location contradiction** — F36's shape, checkable because the fixture plants it

Report the **informative denominator** on every rate, and never write "fixed" for a zero — F12's
zero-in-sixty against a true rate of 4% is the standing warning. Reuse `narrationOnly` and `fold`
from `src/context.ts` rather than making a seventh copy of the dialogue stripper.

**`bench/utilisation.ts`.** The instrument from §3. Reads `generations.manifest` joined to the tied
passage, scores every included block with `quoted()` from `bench/quote-detect.ts`, and reports per
block kind: tokens sent, share of prompt, runs shared with the prose, longest shared run. Baseline
off the 110 existing rows. This also gives F36's structural half its first number, and **F36 is on no
open list** (BUILD-STATE §6).

### Phase 2 — the four defects from §2

The drift report (2a, per SPEC §7.5), the DIRECTIVE cap (2b), the dialogue strip on extract (2c), and
SYSTEM in the meter (2d). 2a and 2b get their assertions in `test/engine.ts`; 2c gets its in
`test/memory.ts`.

### Phase 3 — held until Phase 1's numbers are read

Candidates, each A/B'd through `bench/ab.ts` with two arms **run simultaneously** against the one
router, since nothing sets a seed:

- **A CAST line** in DIRECTIVE naming who is present and who is not — derivable inside the pure
  function from `passages.speaker` plus fired entries. No schema, no I/O, ~30 tokens.
- **Labelling canon blocks with their entry title**, so four bodies stop being one wall.

Both are prompt changes, and F20 is the price of assuming a prompt change works. Option A from §3
belongs here too, as a workflow decision rather than a bug fix.

---

## Critical files

- `src/context.ts` — `buildContext`, `fires`, `resolveBody`, the anchors, `evict`
- `src/story.ts:101` estimator · `:105` `budgetFor` · `:135` `assemble`
- `src/blocks.ts` — `ORDER`, `CAPS`, the ceilings
- `src/render.ts` — `SYSTEM`, and the only place block order becomes text
- `src/routes.ts:573` chapter end · `:1040` extract · `:122-192` check and mend
- `bench/quote-detect.ts` — `quoted()`, reused rather than reimplemented
- New: `bench/cast.ts`, `bench/utilisation.ts`

## Verification

```bash
node --experimental-strip-types test/all.ts            # 201 checks, eleven suites, no model
node --experimental-strip-types bench/cast.ts check     # detectors, both directions, no model
node --experimental-strip-types bench/utilisation.ts    # baseline off 110 stored manifests
```

Run `test/all.ts` before and after; it needs no llama-server, so there is no excuse for skipping it.

Break each new assertion on purpose and watch that specific one go red, or it is decorative. A
guarded `if (thing) { …checks… }` with no `else` is invisible to a count-based harness — assert the
guard itself.
