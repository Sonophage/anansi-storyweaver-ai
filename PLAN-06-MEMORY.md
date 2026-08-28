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

**CANON-TRIGGERED is 0 because nothing in the database can fire.** Not "nothing fired on this call":
there is no triggered entry anywhere. All twelve entries in `anansi.db` are `always_on`, and every
`keys` array is the entry's own title repeated. §2e has the dump and the four causes. That row is
not a property of this generation, and COUNCIL-04 #7 in §4 is downstream of it.

That table reframes both concerns. Context is not scarce — it is nearly empty, and P6's trigger
still has not fired, so the budget engine is correctly unbuilt. Whatever goes wrong in a crowded
scene, **it is not that the model ran out of room.**

Recall, stated plainly: the current chapter and the two before it whole (`wholeFrom =
currentChapter.index - 2`, `src/context.ts:435`), everything older as a ≤180-word chapter summary or
a 220-word arc, plus ledger entries firing on an 8-passage window plus the directive. TAIL is always
exactly one passage on this book, so DIRECTIVE lands one passage above the end rather than the 220
tokens `story.ts:154` intends.

---

## 2 · Six defects. These are bugs, not judgement calls.

### ~~2a · The token estimator runs 30–48% high on real prose, and its comment says the opposite~~ — FIXED 2026-08-28

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

**MEASURED 2026-08-28, `bench/drift.ts`.** The report is built and its detector is validated; the
constant has not been changed yet, because the measurement moved the question.

- **4.45 characters per token** on `Qwen3.6-WNTH-35B-A3B-NN` over 91 calls (24 under the new preset
  name plus 67 under `write-nt-qwen36-h`, which is the same model before the 2026-08-27 rename).
  The divisor in force is 2.8 — **59% too small**, which is why the estimate comes out 59% too big.
  The comment above `src/story.ts:129` claims the opposite.
- **The context bar is off by 1.28x, not 1.58x**, because 2d cancels part of 2a. SYSTEM is
  **~423 real tokens** missing from every reading, and the estimator inflates by ~59%. They run in
  opposite directions: **fixing 2d alone makes the bar worse.** One commit, or 2d after this report
  can show the two moves apart.
- **SPEC §7.3's warning arrives from a direction §7.3 did not name.** Splitting by canon share
  found nothing — 4.41 against 4.45, and canon is 4-11% of every prompt in the log, so the question
  was never really asked. Splitting by **model** found 1.41 chars/token of spread across the presets
  with ten or more calls (4.28 for `rp-t-glm47flash-h`, 5.69 for `rp-nt-ornith-h`). Characters per
  token is a tokenizer's property. **One global constant cannot be right for two writers on two
  models**, which is exactly the case `ANANSI_MODELS` and the second seat exist to allow.

**And the first version of this measurement was wrong.** Pooled across all five models and split by
date, it read 5.68 before 2026-08-26 against 4.39 after, and the obvious reading — SYSTEM was
rewritten on the 26th, so the rebuild is distorting old rows — was wrong. The date split was
splitting the model mix. Written down because the wrong answer was more plausible than the right
one.

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

### ~~2d · `manifest.totals.used` excludes SYSTEM~~ — FIXED 2026-08-28

`render` prepends SYSTEM and `routes.ts:239` slices exactly that many characters back off to send it
as the system role. So SYSTEM — 1,872 chars, ~445 real tokens of standing instruction — is on the
wire but invisible to the manifest and to the on-screen Context meter, which under-reports every
call by a fixed amount. The exact guard counts the whole string, so only the meter is wrong.

### 2e · Nothing in the ledger can fire. `fires()` has never run on real data.

Read off `anansi.db` on 2026-08-27:

```
$ node --experimental-strip-types -e "
const {DatabaseSync}=require('node:sqlite');
const d=new DatabaseSync('anansi.db',{readOnly:true});
for(const e of d.prepare('SELECT activation,entry_type,title,keys FROM entries').all())
  console.log(e.activation, e.entry_type, e.title, e.keys);"

always_on character You                 []
always_on character Halsey              ["Halsey"]
always_on character The Captain         ["The Captain"]
always_on character Lune                ["Lune"]
always_on character Mercenary           ["Mercenary"]
always_on character Sister Seraphine    ["Sister Seraphine"]
always_on character The Courier         ["The Courier"]
always_on character The Attendant       ["The Attendant"]
always_on character Helvea Belmont      ["Helvea Belmont"]
always_on character Konrad Curze        ["Konrad Curze"]
        (12 rows; Mercenary and Sister Seraphine appear twice, across stories)
```

**Twelve entries. Twelve `always_on`. Zero `triggered`.** And every `keys` array is the title
repeated — F27's "invented `keys` sometimes repeat the title" is not sometimes, it is all of them.

So `fires()` (`src/context.ts:281`) — unicode tokenization, `fold()`, the proper-noun exemption,
multi-word order plus `KEY_SLACK`, the stateless sticky walk — is exercised by six checks at
`test/engine.ts:524-623` and by **nothing in production**. It is the best-tested dead code in the
app. COUNCIL-04 #7's *all 46 entries fired for an eight-person scene* was never a matcher failure;
there was no matcher. The 45% cap and the eviction order are load-bearing precisely because
everything is always-on.

Four causes, all in code:

| # | where | what |
|---|---|---|
| i | `src/prompts.ts:285` | `EXTRACT` asks for "up to 4 keywords" and never asks for an activation. `EXTRACT_SCHEMA` has no such field, so the constrained decode cannot return one even if the prompt did. |
| ii | `src/db.ts:668`, `:164` | `upsertEntry` and the column both default `always_on`, so every proposal lands always-on. |
| iii | `web/app.js:1657` | the trigger-words input is `disabled` when an entry is always-on — the keys the extractor *did* propose are invisible and uneditable, and there is no reason to flip the chip on an entry whose keys you cannot see. |
| iv | `web/app.js:3017`, `:3457` | manual creation is always-on too. The one site that creates `triggered` (`:3138`, "Add to threads") lands it with no keys, deliberately, and says so in a toast. |

**The rule already exists in this repo and runs on one path only.** `src/import.ts:123`:

```ts
activation: keysOf(w.keys ?? w.key).length ? 'triggered' : 'always_on'
```

with the reasoning at `:121-122` — *"An entry with no keys can never fire, so it becomes always_on
rather than silently dead weight."* Apply the same rule at the three proposal sites
(`src/routes.ts:1049` extract, `:854` threads, `:926` invent): honour a model's explicit
`always_on`, but let an empty key list override a `triggered` answer. Nothing may land
triggered-and-dark. `EXTRACT` also needs to say what a key is *for* — the words that appear in the
prose when the thing is in play, not the title of its own entry.

**This is the one item on the list that makes the prompt smaller.** §3's recommendation is that the
next win is precision and presence rather than another retrieval tier. This is that win, and it adds
no tier, no column and no call.

**2a AND 2d, AS BUILT — and the meter needed neither of them.**

`/api/manifest` has done a `/tokenize` round trip and returned `exact` beside the manifest since the
route was written, and `app.js` never read it: the bar drew `totals.used`, the estimate, and
inherited both defects at once. The generate path was always right — `routes.ts:258` overwrites
`totals.used` with the same count — so the bar was exact after a generation and 1.28x out on the
next repaint, which is why it never looked like a fixed offset. **The bar now uses the tokenizer's
answer, and the estimator stops being the thing the writer reads.** Three lines, no constant
involved. The segments are scaled to the total printed above them, and when the router is asleep
`exact` is null and the estimate is shown marked `(est.)` rather than in the same typeface as a
measurement.

That leaves the estimator with one job — the ceilings and the refusal inside `buildContext`, which
are pure and cannot make a round trip. **2.8 → 4.2**, and 4.2 rather than the 4.45 median because
4.2 sits under the lowest rate any model measured (4.28, `rp-t-glm47flash-h`, n=45): the estimate
stays slightly high for every model in the log instead of exact for one and low for another. High
is the safe direction — the engine trims early; low means `fits()` refuses late, with an error on
screen. The rule for re-choosing it is written at the site and asserted in `test/db.ts`, so setting
it to the median goes red.

**2d is taken off the budget, not added to the blocks.** A SYSTEM block would need a place in
`ORDER`, a colour, a name in `BLOCK_ORIGIN` and a row in the panel — the same argument
`context.ts:548` already used to keep the lockout riding DIRECTIVE. And what 2d fixes is worth
stating narrowly: **the 6% margin was already large enough to absorb SYSTEM**, so nothing was
overflowing. What was wrong was the number — `totals.budget` told the writer they had ~445 tokens
they did not, and the 45%/25%/60% ceilings were fractions of it.

**The check that was guarding this asserted the constant against itself.** `test/db.ts` divided a
fixture by 2.74 and compared it to an estimate that divided by 2.8. It could not fail while those
two agreed, and it reported the estimator "within 15%" for as long as it was 59% out. It is now a
measured (18,107 chars → 4,067 charged tokens) pair off the generation log, plus the choose-the-
lowest-model rule. Seven falsifications, each watched go red: the bar reverting to the estimate,
unscaled segments, the divisor at the median, the divisor at 2.8, SYSTEM back on the budget, the
`(est.)` label removed, and the label never clearing.

### ~~2f · Three key parsers, and the authoritative one drops keys silently~~ — FIXED 2026-08-28

| where | behaviour |
|---|---|
| `src/import.ts:55` `keysOf` | splits a string on comma, trims, drops empties, caps at 8. Module-private. |
| `web/app.js:3038` | the same logic inline, cap 10 |
| `src/db.ts:669` | `Array.isArray(e.keys) ? e.keys.filter(Boolean) : []` — **a comma-separated string is discarded, not split** |

The third is the write path every route reaches, so a model or an API client that posts `"coat, iron
bridge"` loses both keys and the entry looks fine. Rule 7: `keysOf` is the correct one, so move it to
`src/db.ts` — the lowest layer, and the only direction that does not create a cycle — export it with
a cap parameter, and have `import.ts` call `keysOf(x, 8)` so its behaviour stays byte-identical.
SPEC §7.1's 2-32 char bound belongs there too; it is validation at a trust boundary, not a
simplification to skip.

`grep -rn "keys" test/` confirms **every existing fixture passes keys as a pre-built array**, so the
comma split is entirely unasserted today. That is the exact shape of the tag-splitting fix
`.claude/CLAUDE.md:45-51` records as having shipped green because its fixture had no comma in it.

**Done as written, plus one thing this plan did not predict.** `keysOf` moved to `src/db.ts` with a
`cap` parameter and SPEC §7.1's 2-32 bound; `import.ts` calls `db.keysOf(k, 8)`; `app.js` mirrors the
bound so the box does not show a key the server is about to drop, and says in a comment that `db` is
authoritative. Four assertions, each falsified — restoring the old line gives `[]` against
`['coat','iron bridge']`.

The unpredicted part: **the bound made an existing import defect reachable, and the new assertion
caught it.** `fromCard`'s lorebook branch set `activation` from the card's `constant` flag alone,
so a non-constant entry whose keys did not survive imported as `triggered` with zero keys — the
class `db.ts:881` already names, arriving from the importer. The other two importers had always read
the keys. Fixed in the same commit; falsified by putting `e.constant` back.

**Why 2e needs a probe before it needs a patch.** Flipping an entry to `triggered` whose keys never
appear in the prose removes it from the model's context silently. `src/db.ts:836` already names the
class: *"a triggered entry with no trigger words never reaches the model again and looks fine."*
Measure first — see Phase 1.

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

One correction to the shape, not to the verdict: the retrieval need not be a LIKE scan. `node:sqlite`
on Node v26.7.0 ships FTS5 with BM25 ranking (verified 2026-08-27), so B could rank rather than
merely match. That improves the ordering and does nothing about the objection above, which is that
no instrument can separate a real hit from `iron bridge`. Note also `src/db.ts:80-85`: a drop loop
for a previous `passages_fts` that *"nothing ever populated or queried"*. Git does not contain that
attempt — it predates the first commit, so those three comments are the whole record. Whatever B
becomes, its index has to be maintained by the database itself and asserted non-empty, or it repeats
exactly that.

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

**Measured 2026-08-27, and it is further off than the option implies.** `POST /v1/embeddings` on the
router answers **501** — *"This server does not support embeddings. Start it with `--embeddings`"*.
No preset in `/data/models/presets.ini` carries the flag, and there is no embedding model on the
machine (`find /data/models -iname "*embed*" -o -iname "*bge*" -o -iname "*gte*" -o -iname
"*minilm*"` returns nothing). The router reports `max_instances: 3` and `models_autoload: true`, so
an embedder could sit beside the writer — but that is a download and a `presets.ini` change on
Ryoku, not a repo decision. One correction to the framing: Postgres is not the only door. `halfvec`
and an ANN index are what you need at a million rows; at 63 passages the ranker is a `for` loop over
cosine, and `node:sqlite` exposes `loadExtension` if `sqlite-vec` is ever wanted. C remains a
platform decision, as stated — it is just not the only way to get vectors.

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

> **Correction, same day, after building the probe.** 110 is right and unusable. `generations.passage_id`
> carries no foreign key (`src/db.ts:282`), and **59 of those 110 name a passage that no longer exists** —
> takes deleted after the call. The informative denominator is **51**, and `bench/utilisation.ts` prints
> all four numbers so the loss stays visible: 323 prose generations, 146 still holding a manifest, 110
> tied, 51 joinable. This is F10's rule arriving in this document's own arithmetic.

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

### Phase 1 — three probes. Detectors need no model.

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

**`bench/ledger-audit.ts`.** The detector 2e needs before 2e can be patched. Read-only against a
copy of the database, no model. Per entry: activation, keys, whether `keys` is just the title, how
many of the story's own selected passages a key would fire on, the first and last firing ordinal,
and a verdict — `safe to trigger` / `would go dark` / `no keys` / `is POV`. Reuse `toEntry`
(`src/story.ts:10`) for the row mapping and the POV comparison at `src/context.ts:393-395` verbatim
rather than writing a second one; export `fires` rather than reimplementing it.

Ships a `check` subcommand on the model of `bench/voice.ts:17-38` — labelled synthetic cases with
known answers, including a key that fires, one that does not, a multi-word key out of order, and
`Aldis`/`Aldi` — exiting nonzero with *"do not believe a result from this"* on any miss. An audit
that reports twelve entries safe because its firing check never fires is the failure this repo has
already shipped twice.

### Phase 2 — the six defects from §2

The drift report (2a, per SPEC §7.5), the DIRECTIVE cap (2b), the dialogue strip on extract (2c), and
SYSTEM in the meter (2d). 2a and 2b get their assertions in `test/engine.ts`; 2c gets its in
`test/memory.ts`.

2e and 2f land here too, and they are the cheapest of the six: the shared `keysOf` and its
comma-split assertion in `test/db.ts`, the `activation` field on `EXTRACT_SCHEMA`, the import rule
applied at the three proposal sites, and the editor's trigger-words input un-disabled. Gated on
Phase 1's audit being green — patch the supply side first, then work the twelve live entries by
hand. Do **not** write an apply script for the backfill: twelve entries is twelve taps on a chip
that already exists (`web/app.js:1651`), and `activation` is not in `revertEntryField`'s allowlist
(`src/db.ts:1001` permits `title`, `body`, `keys`, `notes`), so a scripted flip is the one that
cannot be undone from the UI.

Then measure what it did. `manifest.byKind` before and after on one story, canon token share both
ways, with the denominator. If it did not move, say so.

### Phase 3 — held until Phase 1's numbers are read

Candidates, each A/B'd through `bench/ab.ts` with two arms **run simultaneously** against the one
router, since nothing sets a seed:

- **A CAST line** in DIRECTIVE naming who is present and who is not — derivable inside the pure
  function from `passages.speaker` plus fired entries. No schema, no I/O, ~30 tokens.
- **Labelling canon blocks with their entry title**, so four bodies stop being one wall.

Both are prompt changes, and F20 is the price of assuming a prompt change works. Option A from §3
belongs here too, as a workflow decision rather than a bug fix.

---

## 6 · The open question this plan does not answer

**Internal coherence needs a judge, and Phase 1's probe cannot reach it.**

**The measurement.** F36, from one real passage: *"She reaches into her pocket, pulls out a
weather-beaten Martin guitar, and taps one against the filter."* Two causes were found and both
fixed — a SYSTEM line (*"Canon is what is TRUE, never how to say it"*) and the fact-list body
rewrite, which took the same passage from 3 shared runs to 0. What is **not** fixed is the class, and
F36 says so in its own words:

> The checker is structurally blind to this. It compares a passage against canon, and canon SAYS she
> carries a weather-beaten Martin — so a passage saying she carries one agrees with canon perfectly.
> The incoherence is internal: she set the case down two paragraphs earlier, and pockets do not hold
> guitars. **Nothing in the pipeline looks for internal coherence**, and no amount of tuning the
> contradiction prompt would find this.

F17 drew the line this runs into: *canon contradiction is lexically checkable — the wrong word is
literally present. Instruction compliance is not.* Internal coherence is on the far side of that
line, and `agentic-t-tcap27-h` is already loaded in the router for exactly this kind of call.

Where it is tracked, precisely: `checklist.md:294` carries it under *measured, known, not fixed*, and
it has **no `ponytail:` marker in the code** — which is what "no marker anywhere" there means.
BUILD-STATE §6's heading *"F36 is on no open list"* is itself stale, and is a ninth instance of the
drift that document's own §6 catalogues.

**A** — **Build nothing.** Accept that the class is unchecked and rely on the writer reading their own
prose. Defensible: it is one passage, and the two mechanical causes are fixed.

**B** — **Stop where n-grams stop.** Phase 1's `bench/utilisation.ts` gives the verbatim-lifting
number cheaply and honestly, off the 110 stored manifests. Ship that, and do not pretend it covers
coherence. This is what Phase 1 does today.

**C** — **A judge pass, bench-only first.** `bench/coherence.ts`: the accepted passage plus the last
two or three passages to a judge model, asked only *"does this passage contradict the prose
immediately before it — an object, a position, who is present, what someone is holding?"* Fixture
carries planted incoherences so the judge can be validated in both directions before any number from
it is believed.

**D** — **A judge at generation time**, in the `mend` loop beside the contradiction check.

**I would pick C, and explicitly not D yet.** Two reasons, both measured. F30 timed the existing
repair at **median 1,456 ms on every generation** — roughly a third of a warm generation — and it
fired **0 of 6**, which bounds its rate under about 40% and nothing tighter. A second judge call on
every generation doubles that standing cost for a class whose rate is currently one known instance.
And a judge needs its own fixture before it is trusted at all: F26 and F35 each recorded *"the
detector was wrong before the model was"*, and F17's knife probe was **void on its own terms** —
0 of 20, because the canon fact was a history rather than a prohibition.

So: measure the rate bench-side, and let the rate decide whether it earns a place at generation time.
If C comes back at F36's apparent frequency, D is not worth 1.5 seconds a call.

**What is still unknown even under C.** Whether internal incoherence gets *worse* with four
characters on the page. That is the intersection of this section and §4, and neither probe as scoped
measures it — `bench/cast.ts` plants contradictions against canon, not against the preceding prose.
Worth folding in once both exist and the baselines are known.

---

## Critical files

- `src/context.ts` — `buildContext`, `fires`, `resolveBody`, the anchors, `evict`
- `src/story.ts:101` estimator · `:105` `budgetFor` · `:135` `assemble`
- `src/blocks.ts` — `ORDER`, `CAPS`, the ceilings
- `src/render.ts` — `SYSTEM`, and the only place block order becomes text
- `src/routes.ts:573` chapter end · `:1040` extract · `:122-192` check and mend
- `bench/quote-detect.ts` — `quoted()`, reused rather than reimplemented
- `src/prompts.ts:285` `EXTRACT` · `src/import.ts:55` `keysOf`, `:123` the activation rule
- `web/app.js:1657` the disabled trigger-words input · `:1651` the activation chip
- New: `bench/cast.ts`, `bench/utilisation.ts`, `bench/ledger-audit.ts`

## Verification

```bash
node --experimental-strip-types test/all.ts            # 201 checks, eleven suites, no model
node --experimental-strip-types bench/cast.ts check     # detectors, both directions, no model
node --experimental-strip-types bench/utilisation.ts    # baseline off 110 stored manifests
node --experimental-strip-types bench/ledger-audit.ts check   # firing detector, both directions
node --experimental-strip-types bench/ledger-audit.ts         # verdict per entry, read-only
```

Run `test/all.ts` before and after; it needs no llama-server, so there is no excuse for skipping it.

Break each new assertion on purpose and watch that specific one go red, or it is decorative. A
guarded `if (thing) { …checks… }` with no `else` is invisible to a count-based harness — assert the
guard itself.
