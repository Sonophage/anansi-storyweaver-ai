# Anansi — Build Spec

> **NAMING SUPERSEDED, 2026-08-28.** This is a design document and it is still the argument for why
> the system is shaped as it is. It is **not** a description of the tables that exist. Almost every
> name below was shortened when the schema was built, and a reader who greps for one and finds
> nothing cannot tell whether the feature is missing or the name is. It is the name:
>
> | here | in `src/db.ts` |
> |---|---|
> | `canon_entries` | `entries` |
> | `canon_entry_progressions` | `entry_states` |
> | `canon_entry_state` | nothing — the sticky window is stateless, computed in `context.ts` |
> | `chapter_canon_pins` | `chapter_pins` |
> | `canon_proposals` | `proposals` |
> | `canon_violations` | `violations` |
> | `passage_options` | nothing — variants live in `passages`, keyed on `variant_index` |
> | `universes`, `invites`, `model_capabilities`, `user_provider_config` | never built |
>
> And nine tables exist that this document has never heard of: `arcs`, `dismissals`, `outfits`,
> `prompt_overrides`, `release_notes`, `story_covers`, `strings`, `writer_look`, `entry_revisions`.
> The COLUMN-level gaps are the honest ones and are listed as unbuilt everywhere else —
> `secondary_keys`, `exclusion_keys`, `key_logic`, `reserved_tokens`, `trim_direction`, `embedding`
> are activation depth and the budget engine. `docs/findings/COUNCIL-05.md` seat 4 is the audit.

> **STATUS: LIVE engine reference, with two dead sections.** §13 Milestones describes a
> Postgres/Auth.js build sequence that was abandoned for local SQLite — PLAN-02's phases and
> `findings/BUILD-STATE.md` replace it. §14 Cost and time is pre-build estimation, recomputed in
> PLAN-02 §10. Both are kept only because COUNCIL-03 cites them. Everything else here is current
> unless a finding says otherwise, and `findings/P0-FINDINGS.md` wins on every point of fact.


Revision 4. Nothing is implemented yet.

- Idea capture: `the-idea.md`
- Prompt text: `PROMPTS.md` (defines `system_block`, used in section 7.3)
- Council findings this revision answers: `COUNCIL-01.md`

Revision 3 folded in Council lenses 1-4. It deleted more than it added: five entry features cut,
which removed three defects by removing the code.

Revision 4 folds in lens 5. Two additions earn their weight — **progressions** (7.1), which give
canon a time axis, and **canon violation checking** (8.4), which is the first mechanism here that
checks the model's output instead of only its input.

## 1. What Anansi is

A web application for long-form AI-assisted fiction. A writer starts a story from one prompt,
then writes chapters with the model in one of four modes. Facts pinned as canon in chapter 1
still reach the model in chapter 50.

~~Choose-Your-Adventure is one of four writing modes.~~ **Dropped by Seth, 2026-08-23 — not
deferred. The four modes are Co-Write, Direct, Full Auto and New Scene.** The document editor and the chapter manager
are first-class.

**The one promise: long-form coherence.** Section 12 states what this product does and does not
offer, without inflation.

**Not self-hosted.** Revision 2 said "self-hosted" while locking Vercel and Neon. That was a
contradiction. The application is hosted. Only *inference* can be local, and only through the
browser. See 2.1.

## 2. Locked decisions

| Area | Decision |
|---|---|
| Framework | Next.js App Router, TypeScript |
| Host | Vercel (Hobby is sufficient, see 10.3) |
| Database | Postgres (Neon) + Drizzle ORM |
| Vectors | `pgvector`, `halfvec` columns |
| AI client | Vercel AI SDK |
| Hosted inference | OpenRouter, server-side |
| Local inference | Ollama, **browser-side** (2.1) |
| Users | Closed set, invite only |
| Client | Web-first PWA |

### 2.1 Local inference runs in the browser

A Vercel Function cannot reach Ollama on a home LAN. Revision 2 put the local adapter
server-side, which made local inference impossible and made section 12's privacy claim false.

The fix works because the canon engine is pure:

1. The browser asks the server for a context manifest. No generation happens.
2. The server assembles the manifest and returns it, with the rendered prompt.
3. The browser streams from `localhost:11434` directly. Set `OLLAMA_ORIGINS`.
4. The browser posts the finished passage and the token counts back.

Consequences, stated plainly:

- Prose the writer already saved is in Neon regardless. Local inference means **no new prose
  reaches a third-party model**, not that no prose leaves the machine. Section 12 says this.
- The `generations` audit row for a local call carries client-reported token counts. Mark it
  `source = 'client'`.
- This is a second generate path. Budget it as such, not as "about two days".

Hosted calls keep the normal server-side path. Both paths call the same `buildContext`.

## 3. Prior art

Full research record and verification: `COUNCIL-01.md`. Condensed here.

**FictionMaker** (`fictionmaker.com`) is the product being cloned: four writing modes, a Canon
Ledger with pinned always-on facts and a live budget meter, 30-day revision history, branching,
reusable universes, lore auto-extraction. Pricing is tiered: Free (15 interactions/day),
Reader+ $4.99 (30/day, no export, no uncensored mode, 50-pin cap), Writer $12.99 (unlimited,
uncensored, export), Writer Pro $24.99 (extended memory for novel-length work). Revision 2 quoted
$4.99 as if it were feature parity. It is not.

**AI Dungeon** splits context into four always-present components plus keyword-triggered Story
Cards, re-summarizes every 15 actions, and retrieves with embeddings via its Memory Bank. Its
scripting API injects the author's note **three lines back**, not at the top.

**NovelAI** contributes the budget mechanism: reserved tokens allocated before placement, a
four-rung trim ladder (whole, newline, sentence delimiter, token, then omit), "position equals
strength", and a three-state context viewer with reasons.

**SillyTavern** contributes secondary keys with four logic modes, insertion at depth, and
constant-first ordering. Revision 2 also took recursion, `min_activations`, inclusion groups,
timed cooldown and delay. **Revision 3 cuts all five.** See 7.7.

**Novelcrafter** is the closest commercial product and contributes two mechanisms revision 2
missed. **Progressions**: an addendum anchored to a scene, sent only when writing at or after
that point, in replace or append mode. **Codex detection** is dumber than this design — literal
name and alias matching, case-insensitive, auto-pluralised, with a per-entry *exclusion list*, a
relations graph pulled transitively, and a field-level split where Notes and Research never
reach the model.

**Community practice** on keyword lore: generic keys false-fire, over-specific keys miss
silently, lore should take 25-45% of context, scan depth 2 is too shallow, structured attribute
bodies beat prose, and budget exhaustion is the most common cause of a pinned fact not appearing.

### 3.1 Position equals strength

AI Dungeon and NovelAI converged independently on placing style guidance near the end of the
context. Revision 1 put it at the top. So the spine splits:

- **Spine facts** (title, premise, genre, setting) at the top. Reference material.
- **The style directive** (POV, style, register, chapter author's note) near the end.

Exact placement and text: `PROMPTS.md` sections 2 and 3.

## 4. Architecture

```
Browser (PWA)
  ├── hosted path:  POST /generate    → server streams SSE
  └── local path:   POST /context     → manifest + prompt
                    → browser streams from localhost Ollama
                    → POST /passage   → persist
  ▼
Next.js route handlers
  ├── spark / summarize / extract   (structured output, server-side)
  └── buildContext()                (pure, no I/O)
  ▼
Postgres + pgvector (Neon)
```

`buildContext` takes plain objects and returns a manifest. No database calls, no network calls.
Both generate paths use it. This purity is what makes 2.1 possible.

## 5. Data model — core

**users** — `id`, `email`, `name`, `created_at`.

**invites** — `id`, `email`, `token`, `invited_by`, `accepted_at`.

**Auth.js adapter tables** — `accounts`, `sessions`, `verification_tokens`. Required by the
Nodemailer provider (renamed from `Email` in v5). Not optional, and missed in revision 2.

**user_provider_config** — `user_id`, `provider`, `encrypted_key`, `base_url`, `created_at`.
Roles resolve per user (10.1) and the keys need somewhere to live.

**model_capabilities** — `model_id`, `provider`, `context_window`, `max_spice`,
`supports_structured_output`, `cost_in_per_mtok`, `cost_out_per_mtok`, `tokenizer_id`.
Section 10.2 requires routing to refuse a model that will refuse the register. That needs a
table. It is also the price table `generations.cost_usd` needs.

**universes** — `id`, `owner_id`, `name`, `description`.

**stories** — `id`, `owner_id`, `universe_id` (nullable), `title`, `premise`, `genre`,
`setting`, `pov`, `writing_mode`, `spice_level`, `writing_style`, `status`,
`max_context_tokens`, `engine_config` (jsonb), `model_config` (jsonb), timestamps.

`max_context_tokens` defaults to **32000**. Revision 2 derived the budget from the model's own
window, so pointing `prose` at a 262K model raised the bill from $6.30 to $47.23 per writer per
month with no code change. The budget derives from this field, never from `T`.

`engine_config` and `model_config` are Zod-schemad with versioned defaults. An unset key reads
its default, never `undefined`.

**chapters** — `id`, `story_id`, `branch_id`, `index`, `title`, `summary`,
`summary_token_count`, `summary_covers_through_ordinal`, `summary_source_hash`,
`parent_summary_id` (nullable), `authors_note`, `status`.

The last two summary fields exist because a summary goes stale silently when covered prose is
regenerated, and a stale summary then contradicts the prose in every later call, forever. On
hash mismatch the summary is flagged stale, excluded from context, and re-run.

## 6. Data model — prose, versions, branches

### 6.1 Slots and variants

**passages** — `id`, `chapter_id`, `branch_id`, `slot_key`, `ordinal`, `variant_index`,
`selected`, `author`, `body`, `token_counts` (jsonb), `directive`, `generation_id`,
`embedding` (halfvec, nullable), `created_at`.

1. A slot is `(chapter_id, slot_key)`. `slot_key` is a **fractional ordering key**, not a
   sequential integer. Inserting mid-chapter must never renumber, because timed-effect state and
   summary coverage both reference position.
2. `ordinal` is an absolute monotonic passage number within the branch. All engine counts use
   it, never `slot_key`.
3. Exactly one variant per slot has `selected = true`. Enforced by a partial unique index.
   **Write order: unset the incumbent, then insert.** The index is not deferrable.
4. Regenerate writes a new variant into the same slot and deletes nothing.
5. Discarding the last selected variant is forbidden. A slot always has one.
6. `token_counts` is a map keyed by tokenizer id, not a single integer. See 7.5.

**passage_revisions** — `id`, `passage_id`, `body`, `replaced_at`. Editing a passage body in
place otherwise destroys history irrecoverably, which would leave Anansi with less version
safety than FictionMaker's free tier. Revision 2 listed chapter-level revision history as a
taken feature and then never specified it.

**passage_options** — `id`, `passage_id`, `label`, `body`, `chosen_at`.

### 6.2 Branches — copy-on-write

Revision 2 said forks "copy chapter rows by reference". That was incoherent: `selected` is one
boolean on a shared row, so regenerating a pre-fork passage inside a fork rewrote the parent
branch.

**branches** — `id`, `story_id`, `parent_branch_id`, `name`, `fork_ordinal`, `is_primary`.

A fork **duplicates** `chapters` rows and the *selected* `passages` rows up to the fork point.
One-time cost, trivial at this scale, and every read becomes `WHERE branch_id = ?` with no
recursive walk. `chapters.index` is gapless per branch, which is now true rather than aspirational.

`branch_id` and the copy-on-write logic land at M0. The UI is unscheduled.

## 7. The Canon Ledger and the canon engine

### 7.1 The entry schema

**canon_entries** — `id`, `story_id` (nullable), `universe_id` (nullable), `title`, `body`,
`notes`, `entry_type`, `priority`, `activation`, `keys` (text[]), `secondary_keys` (text[]),
`exclusion_keys` (text[]), `key_logic`, `sticky_for`, `reserved_tokens`, `trim_direction`,
`proper_nouns` (boolean), `token_counts` (jsonb), `embedding` (halfvec), timestamps.

- `entry_type`: `character | lore | item | rule`.
- `activation`: `always_on | triggered`.
- `keys`: up to 10, each 2-32 chars. A key wrapped in `/` is a regex, matched at token
  boundaries only (7.4).
- `key_logic`: `any | and_any | and_all | not_any | not_all`. On an `always_on` entry the
  negative modes act as a **suppression filter** and the positive modes are ignored. Revision 2
  left this undefined, so "always include Marek, except in a funeral scene" silently failed.
- `exclusion_keys`: if any fires, the entry does not. Novelcrafter's answer to the false-fire
  problem, and a more direct one than secondary keys. One column.
- `notes`: writer-only. **Never sent to a model.** Without it, authors put spoilers and TODOs in
  `body` and leak them into the prose.
- `proper_nouns`: suppress stemming for this entry's keys. Defaults **true** for `character`.
- A regex key **bypasses whole-word matching**. Say so in the UI, because SillyTavern has the
  same behaviour undocumented and it surprises people.
- Exactly one of `story_id`/`universe_id`, by check constraint.

**canon_entry_progressions** — `id`, `entry_id`, `from_chapter_id`, `from_ordinal`, `mode`
(`replace`/`append`), `body`, `token_counts`.

Canon that cannot change over time is the wrong model for a novel, and revision 2's own worked
example proves it: `[the Silver Key: ... its loss is chapter-7 canon]` crams a temporal fact into
a static body, so writing chapter 3 leaks a chapter-7 spoiler and writing chapter 40 describes a
dead character as alive. `force_out` pins are manual labour, not a mechanism.

`buildContext` resolves an effective body: base plus every progression anchored at or before the
current write position, `replace` last-wins. Because the anchor is a chapter on a branch, this is
branch-correct for free.

This lands **before M1**. Retrofitting a time axis after placement, trim and eviction exist is
exactly the rewrite section 6.2 argues against.

**Cut from revision 2:** `inclusion_group`, `group_weight`, `cooldown_for`, `delay_until`,
`non_recursable`, `prevent_further_recursion`, `scan_depth_override`, `case_sensitive`,
`match_whole_words`. Reasons in 7.7.

**canon_entry_state** — `entry_id`, `branch_id`, `last_fired_ordinal`, `sticky_until_ordinal`.
Primary key `(entry_id, branch_id)`. Revision 2 keyed this by `chapter_id`, so every sticky
window reset at each chapter boundary, reintroducing flicker at the first paragraph of every
chapter.

**chapter_canon_pins** — `chapter_id`, `canon_entry_id`, `mode` (`force_in`/`force_out`).
A check requires the pinned entry to be visible to that chapter's story. Without it a pin can
inject another user's canon, which is a cross-user leak, not only a coherence bug.

**canon_proposals** — `id`, `story_id`, `chapter_id`, `title`, `entry_type`, `body`, `keys`,
`justifying_passage_id`, `status`, `content_hash`. Section 8.2 needs durable rows and a dedupe
key, or re-running extraction re-proposes the same character every time.

### 7.2 The entry form ships six fields

Author-facing: **title, body, type, activation, keys, priority.** Plus `sticky_for = 3` applied
invisibly to characters.

Every other column exists in the schema and is settable only by seeding or by hand. No form, no
validation copy, no help text, no test matrix. Revision 2's eighteen-field form cost an
estimated 37-55 hours against knobs a novelist will not turn.

Body format is Markdown, with a bracket template offered per type because attribute lists cost
fewer tokens and leak less style than prose:

```
character  [Aldis Fen: 34, ex-Watch sergeant, limp (left knee), owes Marek money]
lore       [Order of the Silver Key: monastic, keeps the city archive, feared not loved]
item       [the Silver Key: brass not silver, opens the archive vault, Aldis carries it]
rule       [Magic costs memory. Every casting removes one recollection, permanently.]
```

### 7.3 Budget

```
T          = min(story.max_context_tokens, model.context_window)
anchors    = spine_facts + style_directive        (never trimmed, hard-capped)
available  = T - system_block - output_reserve - safety_margin
layer_base = available - anchors
```

`system_block` is defined in `PROMPTS.md` section 1. Revision 2 used the term in this equation
and defined it nowhere.

**Anchors are inside the base.** Revision 2 computed layer percentages against `available` while
spending the anchors outside it, so a fully-loaded context could overrun by the anchor size with
`overflowed = false`. Anchors are capped at 400 (spine) and 250 (directive) tokens, validated at
write time, counted, and rendered in the meter.

Reject `output_reserve > 0.5 * T` at config time. Assert `layer_base > sum(floors)` before
placement and fail naming the binding constraint.

Layer floors and ceilings, as a percentage of `layer_base`:

| # | Layer | Position | Floor | Ceiling |
|---|---|---|---|---|
| 1 | Always-on canon | top | 8% | 20% |
| 2 | Chapter summaries, distant | top | 8% | 20% |
| 3 | Triggered canon | top | 5% | 20% |
| 4 | Universe lore | top | 3% | 12% |
| 5 | Vector recall | top | 0% | 8% |
| 6 | Recent prose | tail | 30% | 75% |

**Summaries moved to the top.** Revision 2 read "position equals strength" as a monotonic
gradient and put summaries at position 5 of 6. Attention is highest at the beginning *and* the
end and degrades in the middle, so revision 2 parked the layer carrying the entire story's
history in the worst position in the context. The last one or two chapter summaries stay near the
tail; everything older goes up top. One reorder, free.

**Ceilings bind only under contention.** Compute demand per layer. If total demand fits, every
layer takes its demand and layer 6 absorbs the remainder up to 75%. Only when demand exceeds
`layer_base` do ceilings, the 45% cap and the eviction order apply. Revision 2's hard ceilings
left up to 35% of the window permanently unusable in early chapters, when prose is the only
coherence signal there is.

**The slack flows one way only.** Unused prose budget does not become canon budget. AI Dungeon's
allocation is asymmetric for the same reason: a suddenly chatty ledger must never squeeze the
prose. Prose absorbs slack; canon does not.

**Combined canon cap:** layers 1-4 together may not exceed 45% of `layer_base` under contention.
Shortfall distributes by priority order, highest first. Revision 2 left the distribution policy
undefined.

**Layer assignment is a total function**, evaluated in order:

1. story-scoped and `always_on` → layer 1
2. story-scoped, `triggered`, and fired → layer 2
3. universe-scoped, any activation → layer 3
4. vector-only → layer 4

Revision 2's layers overlapped, so promoting a protagonist from story to universe scope silently
dropped his ceiling and made him the second thing evicted.

### 7.4 Activation

**Scan window:** `scan_depth` derives from the canon budget rather than being hardcoded —
`clamp(canon_budget_tokens / 100, 4, 16)` passages, capped at 2000 tokens. AI Dungeon does the
same division and for the same reason: a wide scan that fires 40 entries into a budget holding 6
is worse than a narrow one. Report the effective window in the manifest.

1. Tokenize the window on unicode word boundaries. Never compare substrings.
2. Lowercase. Build two sets: raw tokens, and Snowball stems.
3. Match each key:
   - `proper_nouns = true` → exact match against the raw set, plus a plural and possessive rule
     only. No stemming.
   - otherwise → stem the key, match against the stem set.
   - **multi-word key** → strip stopwords, require at least one non-stopword stem, and require
     all remaining stems **within 30 tokens of each other**.
   - regex key → matched at token boundaries.
4. Apply `key_logic` against `secondary_keys`. Then `exclusion_keys`: any hit kills the entry.
5. Apply `sticky_for`: an entry that fired at ordinal N stays active through N + `sticky_for`.
6. Force-include the POV character's entry. Novelcrafter does this and it is one line.
7. Apply pins. `force_in` overrides everything. `force_out` is a hard filter applied last.

**Read state as of `ordinal - 1`.** Never include the ordinal being generated. Revision 2 read
live state, so regenerating a slot saw its own previous fire and suppressed the entry: variant 1
obeyed canon, variant 2 contradicted it, from an identical click. State writes are an upsert
keyed by ordinal, so re-running a slot overwrites rather than accumulates.

Why the proximity bound: revision 2's "all stems present anywhere in the window" made
`Order of the Silver Key` fire on "he **ordered** a **silver** locket" plus "the **key** turned"
four passages later. Why no stemming on proper nouns: Snowball collapses Winter/wintered,
Grace/graceful, Darkness/dark, and Aldis/Aldi.

Known and documented in the UI: word forms match ("running" fires on "runs"); irregular forms do
not ("went" does not fire on "go") and need their own key.

Show a live fire preview in the editor. Trigger rules are hard to reason about and easy to
understand when the writer watches them fire.

### 7.5 Reservation, placement, trimming

**Reservation is a floor inside placement, not a pre-deduction.** Revision 2 deducted the sum of
`reserved_tokens` from `available` before placing anything, clamped per entry but never in sum.
Thirty spark-seeded characters at 200 reserved tokens each drove `available` to 49 on an 8K local
model, and at forty characters it went negative. Unused reservation was never returned, so prose
starved while the meter read healthy.

1. Clamp the reservation sum per layer to that layer's ceiling, and layers 1-4 to the 45% cap.
   Evict reservations lowest-priority first, reporting each clamp.
2. Place: layer order, then descending priority within a layer.
3. Each entry takes `max(reserved, actual)` but releases `max(0, reserved - actual)` back to the
   pool immediately.
4. Trim ladder per entry: whole → newline → sentence delimiter → token → omit.
   `trim_direction` picks the end.

**Eviction under overflow:** vector recall to zero → universe lore to floor → summaries to floor,
oldest first → triggered canon to floor → always-on to floor → recent prose from the head, using
the same trim ladder so the 30% floor is respected → fail, naming the constraint.

Layer 6 head-trimming is ladder-based, not passage-granular. A single 2400-token pasted scene
must not blow the floor by being the only unit available to drop.

**Token counting is per tokenizer.** `token_counts` is a jsonb map keyed by `tokenizer_id`, not
one integer. Counting an Anthropic or Llama context with an OpenAI BPE runs 10-30% light on the
bracket-dense bodies in 7.2, and the provider then truncates from the left — removing the spine
facts the product exists to preserve, while the manifest reports them `included`.

```
safety_margin = max(0.06 * available, 128)
              + per_message_overhead * message_count
              + join_overhead
              + cross_tokenizer_multiplier   (only when counter ≠ target)
```

Verify continuously: compare `manifest.totals.used` against `generations.prompt_tokens` on every
call and surface the drift. Both numbers are already recorded.

### 7.6 Vector recall

Embed selected passages and entry bodies into `halfvec` columns. At generation, embed the last
two passages and retrieve top K by cosine similarity. K = 3, which matches SillyTavern's default.

**Prepend a situating header before embedding a passage:** chapter title, the first sentence of
that chapter's summary, and the POV character. A bare passage loses the context that makes it
findable; contextual prefixes cut top-20 retrieval failure by roughly a third. All three fields
are already computed.

**Every query filters `selected = true` AND the current branch**, and excludes anything already
in context plus anything `force_out`. Revision 2 filtered neither, so recall could surface a
discarded variant — Marek dead in a rejected take — and inject prose the story does not contain,
labelled only `firedBy: ['vector']`.

Flipping `selected` maintains the index. Pin the embedding model and record it per row; changing
it forces a re-embed (cheap in money, one weekend in migration).

Ship at M6. Columns and the seam land at M0. The keyword path must work on its own first,
because a vector layer hides trigger bugs behind plausible recall.

### 7.7 What revision 3 cuts, and why

| Cut | Reason |
|---|---|
| Recursion + its two flags | Off by default. Ran before inclusion-group resolution, orphaning children of evicted parents. Deleting it removes the defect. |
| `min_activations` | Off by default. **SillyTavern documents it as mutually exclusive with recursion**; revision 2 ran both. Its rescan also re-admitted entries that secondary-key logic and `force_out` had already rejected, spoiling a pinned reveal. |
| `inclusion_group`, `group_weight` | No worked example for novel writing exists. Its use case is mutually exclusive character states in roleplay. |
| `cooldown_for` | Applied before sticky, so sticky overrode it: dead by default on every character entry. It also actively opposes long-form coherence. |
| `delay_until` | Redundant with `chapter_canon_pins`, and defined chapter-relative, so it flickered on and off at every boundary. |
| `case_sensitive` | Unimplementable against a pre-lowercased stem set without a second pass. |
| `match_whole_words` | Tokenization already forces whole-word matching. Setting it false did nothing. |
| `scan_depth_override` | Silently defeated by the 2000-token window cap. Looked like it worked. |

Columns may return. The code, the UI and the tests do not, until something real needs them.

### 7.8 The manifest

```ts
{
  blocks: PromptBlock[]
  layers: { name, tokensUsed, tokensReserved, floor, ceiling }[]   // anchors included
  entries: {
    id, title, layer,
    state: 'included' | 'partial' | 'omitted',
    reason: string,
    tokensUsed: number,
    firedBy: string[]     // matched keys | always_on | sticky | pinned | vector
  }[]
  totals: { available, layerBase, used, unallocated, outputReserve, safetyMargin }
  effectiveScanWindow: { passages, tokens }
  overflowed: boolean
}
```

Three states with reasons, following NovelAI. `firedBy` turns a coherence bug from guesswork into
a lookup. `unallocated` makes waste visible.

Stored on every `generations` row, and **readable**: a manifest inspector ships with M1. Storing
it without a viewer is not a debugging strategy, and revision 2 built no viewer in any milestone.

### 7.9 The meter

Stacked bar, one segment per layer plus anchors, output reserve and `unallocated`. Counts of
trimmed and omitted entries below, full list on click, alert on overflow. Read section 12 before
calling this a differentiator. It is not one.

## 8. Spark, extraction, summaries

Prompt text for all three: `PROMPTS.md` section 5.

**Spark** (8.1): one structured call, Zod-validated, one retry on failure. The user edits every
field before accepting. On accept, create the story, its primary branch, and one `always_on`
character entry per character with the name as key and `sticky_for = 3`. A new story starts with
a populated ledger, because nobody fills an empty one.

**Extraction** (8.2): on chapter close and on demand, propose entries into `canon_proposals`.
Never auto-accept. Auto-writing canon lets the model pin its own hallucination as permanent
truth, which is the exact failure this product exists to prevent.

**Summaries** (8.3): two independent triggers, whichever fires first — N passages **or** N words
since the last summary, both derived from the window rather than hardcoded. SillyTavern uses
exactly this pair for exactly this reason: a chapter of long passages and a chapter of short ones
need different cadences.

**Summaries carry arc and delta only.** Anything that reads as a durable fact routes to the 8.2
proposal queue instead of into the summary. AI Dungeon runs the same split — a deliberately lossy
rolling summary alongside a separate fact store — and a summary that is also the fact store loses
facts every time it compacts. `parent_summary_id` allows an act-level tier above the chapter row
when a book gets long enough to need one.

Store coverage ordinal and source hash so a summary invalidated by a regenerate is caught rather
than contradicting the prose for the rest of the book. SillyTavern is the only prior art that
invalidates automatically, and it hashes only the last message. Anansi has a full passage table,
so it can do better for free.

**Test it:** extract atomic facts from a chapter and assert each is entailed by its summary. This
is the one part of the pipeline that currently has no check at all.

### 8.4 Canon violation checking

Anansi pushes canon into the prompt and never checks whether the output contradicts it. **No
shipping product does this** — not Novelcrafter, Sudowrite, NovelAI, AI Dungeon, Squibler,
SillyTavern or Kobold. It is nonetheless buildable now, cheaply, because the hard input already
exists: `generations.context_manifest` is exactly the list of canon facts that reached the
prompt.

After a passage is **selected** (not on every variant), one `check`-role call:

```
input:  the manifest's included canon entries + the new passage
output: [{ entry_id, quote, why, confidence }]
```

**canon_violations** — `id`, `passage_id`, `canon_entry_id`, `quote`, `reason`, `confidence`,
`status` (`open`/`dismissed`/`fixed`).

Surface as a non-blocking flag in the editor. **Never auto-rewrite.** Same reasoning as 8.2:
the model does not get to silently correct the writer's book.

Published staged LLM-judge approaches report roughly 0.88 precision at 0.55 recall on this task,
which is well short of perfect and still several times the error-discovery rate of human
reviewers. Half the contradictions caught at a nuisance cost of one cheap call is a good trade.
Upgrade path if the judge proves noisy: atomic-claim extraction plus an entailment model.

**Reuse the same role on extraction proposals.** Around a third of model-written character facts
contradict the source story, and 8.2 already stores the justifying passage. That is the premise
for a check that costs nothing extra to wire.

## 9. Writing modes

One pipeline. Only the final instruction block differs. Text in `PROMPTS.md` section 4.

| Mode | User supplies | Model returns | Stored as |
|---|---|---|---|
| Co-Write | Prose, asks for continuation | Prose | Two passages: human, then model |
| Direct | An instruction | Prose | One passage, instruction in `directive` |
| Full Auto | Nothing, or a steer | 1-2 paragraphs | One passage |
| ~~Adventure~~ | — | — | **Dropped 2026-08-23.** `passage_options` was never built. |

~~Adventure is two calls.~~ Dropped; the paragraph below is kept only because its warning about
mixing structured output with prose still applies to `spark`, `extract` and `check`.

Adventure was two calls. The chosen label becomes a Direct directive. Do not mix structured output
and prose in one call.

Regenerate writes a variant into the current slot. `variant 2 of 3`, arrows, keep. Nothing is
deleted.

Toolbar: curly quotes and a scene divider first, then bold and italic. Storage is Markdown.
Resist a full rich-text toolbar.

## 10. Inference

### 10.1 Roles

| Role | Default |
|---|---|
| `spark`, `options` | Mid-tier hosted, structured output |
| `prose` | Permissive hosted, or local |
| `summary`, `extract` | Cheap hosted |
| `check` | Cheap hosted, structured output (8.4) |
| `embed` | Pinned, one model |

Roles resolve from `user_provider_config` and `model_config`. Fallback chains are bespoke code;
the AI SDK registry provides naming, not failover. **Specify mid-stream failure behaviour:** a
provider dying after 400 streamed tokens either restarts the passage or splices two models. Pick
restart, and discard the partial.

### 10.2 Spice Level is routing

An integer 1-5. It selects the register line (`PROMPTS.md` 3.1) and constrains routing:
`model_capabilities.max_spice` must meet or exceed the story's level. Fail loudly when nothing
qualifies. A slider that routes level 5 to a refusing model produces a confusing bug report, not
a content problem.

A hosted gateway applies provider terms; a local model does not. That is the real reason 2.1
exists.

### 10.3 Streaming

Fluid compute is on by default. **Hobby allows 300s**, Pro 800s. Revision 2's "needs Pro" was
stale and would have cost $240/year for nothing.

Duration was never the binding constraint. These are:

- Call `consumeStream()` server-side so a closed tab does not discard the generation.
- Send SSE heartbeat frames; intermediate layers close idle connections.
- Write the passage on finish. A half-generated passage has no defined state otherwise.
- Resumable streams need a separate store. **Not in v1.** Reload loses the in-flight passage.

Local prefill is the real ceiling: a 188K-token context prefills in roughly 7.8 minutes on a 35B
model. `max_context_tokens = 32000` keeps a local generation near 68 seconds. This is the second
reason that default exists.

### 10.4 Prompt caching

The context is nearly prefix-stable within a session, and caching is worth roughly 30-40% of
prose spend after TTL losses. Cache reads cost about 10% of input. Anything ordered *after* a
variable element does not cache at all, which is why revision 2's design defeated it: layer 6
head-trimming, per-call reservation reshuffles and eviction reordering all churned the prefix.

**Freeze layer 1 for the chapter.** `system_block` + spine facts + always-on canon form one
deterministic block, recomputed only when the ledger is edited or the chapter changes. Set the
cache breakpoint at its end. Evict from layers 2-6 first, never layer 1. Record cache-hit tokens
on the `generations` row next to `prompt_tokens`, so the saving is measured rather than assumed.

## 11. Audit

**generations** — `id`, `story_id`, `chapter_id`, `passage_id`, `provider`, `model`, `role`,
`source` (`server`/`client`), `params`, `context_manifest` (jsonb), `prompt_tokens`,
`completion_tokens`, `cost_usd`, `latency_ms`, `error`, `created_at`.

Manifest retention: **90 days**, then drop `context_manifest` and keep the row. At full retention
this table alone exceeds Neon's free tier inside a year.

## 12. Honest positioning

The budget meter is **not** a differentiator. FictionMaker headlines it, AI Dungeon ships a
Context Viewer, NovelAI's is better than both. Build it anyway. Do not call it a moat.

**The comparison that actually threatens this build is SillyTavern**: free, open source,
self-hosted, local-capable, and the richest keyword-lore engine in public. It delivers most of
what follows, today, for nothing. The honest answer is narrow and it is enough: *it is a chat
frontend, not a chapter-based document editor for novels.* Everything below is secondary to that.

What Anansi offers:

1. **A novel-shaped editor** over a canon engine. Chapters, slots, variants, a document.
2. **No per-day interaction cap.** FictionMaker gates unlimited use at $12.99 and novel-length
   memory at $24.99, not $4.99.
3. **Local inference for new prose** (2.1). Existing prose still lives in Neon.
4. **A closed user set**, so there is no moderation surface, no marketplace, no abuse handling,
   and far less product to build. This is the best reason on the list.
5. **Data you control**, exportable. Export is a milestone (13), not an aspiration.

Not claimed: cheaper than a subscription, no shutdown risk, or self-hosted.

## 13. Milestones

> **DEAD SECTION.** M0's `CREATE EXTENSION vector` and Auth.js adapter tables describe a Postgres
> build abandoned for local SQLite. Sequencing lives in PLAN-02 §9 and `findings/BUILD-STATE.md` §5.
> Kept because COUNCIL-03 reviews it.

**M0 — Foundations.** Schema complete in one migration: `CREATE EXTENSION vector`, Auth.js
adapter tables, `user_provider_config`, `model_capabilities`, `passage_revisions`,
`canon_proposals`, `canon_entry_progressions`, `canon_violations`, `branch_id` everywhere,
`halfvec` columns, fractional `slot_key`, tsvector columns, Zod config schemas. Auth with invite
allowlist. Both generate paths stubbed.

**M1 — Vertical slice.** Thin engine: spine, style directive at depth, always-on entries,
**progression resolution**, summaries, prose tail, eviction, the three-state manifest. One mode
(Full Auto). One passage persisted. **The manifest inspector.** Something that works, end to end,
before any test file.

Progression resolution ships here, not later. It is one resolve step now and a rewrite once
placement, trim and eviction exist.

**M2 — Activation matcher.** Keys, secondary keys, `key_logic`, proper-noun handling, proximity
matching, sticky, reservation, the trim ladder. Pure functions, unit tested.

Tests: empty ledger; ledger far over budget; multi-word key inside and outside the proximity
bound; irregular verb that must not fire; `not_any` suppressing an `always_on` entry; sticky
surviving three ordinals; reservation exceeding a layer ceiling; regenerate producing an
identical manifest.

**M3 — Spark and story CRUD.**

**M4 — Writing surface.** Chapter list, editor, Co-Write, Direct, streaming both paths, variants,
the meter, the toolbar.

**M5 — ~~Adventure~~ (dropped), Canon Ledger UI (six fields), progressions UI, pins, extraction proposals,
canon violation flags (8.4), export.** Export is roughly four hours and backs claim 5.

Coherence regression test lands here: one golden story fixture with N planted contradictions,
asserting the 8.4 checker catches them. That test is the first real measurement of the one
promise, and it doubles as the checker's own regression suite.

**M6 — Universes and vector recall.** Split if it runs long; they are unrelated.

**M7 — PWA.** Manifest, service worker, offline reading, install prompt. Note that service
workers and streaming POSTs interact badly; verify early.

Branch UI is unscheduled. The schema supports it from M0.

**Before M0:** run the `PROMPTS.md` section 6 test. Hand-assemble chapter 1, 12 and 40, read the
output, and check the depth-3 placement against top placement. It is the only test of the one
promise that exists, and it costs an evening.

## 14. Cost and time

> **DEAD SECTION.** Estimated before anything ran, and recomputed in PLAN-02 §10 because this
> section's calendar and its hours disagreed. No number here was ever checked against the build.

Costed by Council lens 3, adjusted for revision 4. Revision 3 and 4 did not shrink the build;
they moved hours from wrong work to right work. Cuts saved 37-55h. The browser-side local path,
progressions, the checker, the manifest inspector, copy-on-write forks and the missing tables
added 47-79h back.

**Assumption: about 8 hours a week, so 34 hours a month.** Correct this first. It moves the
answer more than any remaining scope decision.

| Reached | Hours | Calendar | What exists |
|---|---|---|---|
| M0 + M1 | 75-105 | 2.5-3 months | Prose with canon in context, one mode, manifest inspector |
| through M5 | 200-270 | 6-8 months | Spark, editor, four modes, ledger UI, violation flags, export |
| M7 | 280-430 | 8-13 months | Plus universes, vector recall, PWA |

Add about 30% for discovered work.

**Money**, per active writer per month, at `max_context_tokens = 32000`: about **$6.40** hosted,
about **$0** local plus electricity. Prose input is 98.6% of it; summarize, extract and embed
together are 1.4%. Prompt caching (10.4) takes 30-40% off the prose figure.

Without `max_context_tokens`, pointing `prose` at a 262K window raises that $6.40 to **$47.23**.
That one field is the single largest cost lever in the design.

**Neon** needs `halfvec`, selected-only embeddings and the 90-day manifest retention to stay
inside the free tier for a year. Five concurrent writers hit the 100 CU-hour cap.

**Maintenance** after v1: 6-12h a month, mostly forced model migrations and support. That is
20-35% of the monthly capacity above, before any new code.

## 15. Known gaps

1. **Tuned constants remain unfalsifiable** until the M5 golden fixture exists. The 8.4 checker
   plus planted contradictions is the eval; until it runs, roughly fifteen numbers are guesses
   that happen to be written down.
2. **No relations graph.** Novelcrafter pulls relation children transitively, so naming "the
   Council of Five" fetches all five member sheets. Revision 3 cut keyword recursion and did not
   replace it. An explicit `canon_entry_relations` edge table is more predictable and cheaper
   than recursion was. Deferred, not rejected: at thirty entries it is not yet needed.
3. **No intra-ledger contradiction check.** Two canon entries that disagree with each other go
   unnoticed. Nobody does this either. It is cheap to add later on the same `check` role.
4. ~~**Mobile writing** is undecided: reading surface, or real editing?~~ **Resolved:** the phone is
   a full writing surface — 16 sheets, its own composer, same engine and API as the desk.
5. **Cost ceiling.** `generations` records enough to enforce a per-user cap. Not built.
6. ~~**Rate limiting and write concurrency.** Two tabs generating into one chapter need an
   advisory lock.~~ **Retired 2026-08-23 (F19).** Each writer has their own stories, so two
   writers are never in one chapter. One writer on two devices is safe by construction: one
   single-threaded server serialises every write, measured, with a partial unique index on
   `(branch_id, ordinal)` as the backstop.
7. **No resumable streams** (10.3). Reload loses the in-flight passage.
