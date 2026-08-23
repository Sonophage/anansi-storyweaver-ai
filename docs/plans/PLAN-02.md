# Anansi — Plan 02

> **STATUS: LIVE, except where PLAN-03 moves things and where a measurement overrides it.**
> `docs/findings/P0-FINDINGS.md` wins on every point of fact — it was written from the machine and
> this was written before anything ran. Individual superseded claims carry their own notes inline.


Supersedes `PLAN-01.md`. Written 2026-08-22 against `COUNCIL-02.md`, which broke PLAN-01 in eight
seats. `SPEC.md` rev 4 remains the **engine** reference; this document overrides it on host, auth,
inference, client, prompt shape and build order, and marks the places SPEC itself must be corrected.

Read order for review: `the-idea.md` → `SPEC.md` → `PROMPTS.md` → `COUNCIL-01.md` → `PLAN-01.md` →
`COUNCIL-02.md` → this.

---

## 1. What Council #2 broke, and what happened to it

PLAN-01 claimed Council #1's verdict — *a decision written down with confidence, never traced to the
thing it touches* — had stopped being true. Three seats quoted it back at three different sections
and one was unanswerable: `grep -i "co-write\|full auto\|adventure"` returned zero hits against a
document whose product is four writing modes.

### 1.1 Adopted

| Finding | Where it lands |
|---|---|
| The four modes are scheduled nowhere | §9 P2. One switcher, four instruction blocks, one pipeline. Adventure last (§9 P5). |
| §4 and §6 contradicted each other on five items | §6 is now a single per-phase table. There is one list. |
| Concatenation has no overflow behaviour (C1, 5 seats) | Hard guard at P1 (§6.4) **and** the real fix in §7. |
| §7.4's provenance and revert have no schema (C2, 5 seats) | `canon_entry_revisions`, `updated_at`, `last_editor` at P1 (§8). |
| `consumeStream()` mis-traced as serverless (C3, 4 seats) | Restored (§4). Persist on finish, keepalive during prefill. |
| No status surface for either user (C4, 4 seats) | Status strip at P1 (§9 P1) off `/health`, `/props`, `/slots`. |
| No durability story (C5, 3 seats) | `pg_dump` timer at P1; Markdown/JSON export at P2 (§9). |
| First run is empty; spark two phases late (C6, 3 seats) | Spark at P1 (§9 P1). |
| `priority` inert P4→P6 (C7, 3 seats) | Cut from the form. Column defaults. Returns at P6 beside the meter. |
| §9's hours contradicted its calendar by 2.5x | §10, recomputed and shown. |
| Latency figures inherited through three documents unmeasured | Deleted. §9 P0 measures them. |
| §9's "reprefills from scratch" is wrong | Corrected (§5). Slots are assigned by longest-common-prefix. |
| Per-story `system_block` sold as a cache win and a cache cost | Global block + per-story override appended (§5). |
| `generations` deferred destroys P6's own trigger | At P1 (§8). |
| Per-block counting; render only from `manifest.blocks` | At P1 (§6.3). |
| Postgres defended with a false differentiator | §3. The arguments are pgvector and **RLS**. |
| `owner_id` alone is not enforcement | RLS policies at P1 (§8.4). |
| Pin scope constraint cannot be a CHECK | Composite FK; the unique indexes it needs land at P1 (§8.4). |
| `reserved_tokens` is arithmetically inert | **Deleted** (§7.3). |
| `canon_entry_state` cannot answer its own question | **Deleted** (§7.3). |
| Three incompatible layer numberings | Blocks are **named, never numbered** (§6.1). |
| PROMPTS §1 says "system message"; prose runs on `/completion` | Transport declared (§6.2). |
| Depth-3 is 5-10x the prior art it cites | Depth expressed in tokens; the number is P0's to find (§6.1). |
| Zod + one retry is redundant and insufficient | GBNF/`json_schema`; enum literals; ids as per-call enums (§5.3). |
| Register 4/5 smuggle diction; 3/4 lack the adults clause | PROMPTS rev 2 (§6.5). |
| No refusal handling, and refusals compound | Detect, never auto-select (§6.5). |
| Checker gated behind the engine it would validate | Moved to P5 (§9). |
| No word count, no search | P2 (§9). |
| KV quantization, `--cache-reuse`, slot save/restore absent | §5. |
| `/tokenize` is not exact for the chat endpoint | `/apply-template` first (§5.2). |
| Slot `n_ctx` never read; budget can silently halve | `/props` at connect, fail loudly (§5.1). |
| The tailnet is not an allowlist | Explicit allowlist (§4). |
| P2 specced as a document, sized as a block list | Decided at P0 (§9 P0), and it is a **block list** (§9 P2). |
| Notification bell is the wrong surface | The ledger **is** the queue (§7.4). `reprompt` cut. |
| Three-pane slab duplicates the prose | Two panes; the prompt view is a drawer (§9 P1). |
| Panels should be drawers, not columns | §9 P1. The whole mobile retrofit, free, at P1. |
| No-op service worker to verify streaming early | P1 (§9). SPEC §13 said *verify early*. |
| Dev/prod parity on one machine | Second database at P1 (§9). |
| P0 underpriced and not falsifiable as written | §9 P0, recosted and given a criterion. |

### 1.2 Rejected, with reasons

**1. The C1 fix is right and one step short. Summaries move to P2.**

Five seats found that concatenation overflows around chapter 4-8 and prescribed a guard. Take the
guard — it converts silent left-truncation into an error. But a guard does not let you write chapter
nine.

The mechanism that bounds prose growth without the budget engine is **summarization**: chapters older
than N collapse to their summary, the recent tail stays whole. No floors, no ceilings, no trim
ladder, no reservation. PLAN-01 scheduled summaries at P5, four phases after prose starts growing.
That is the actual ordering error, and no seat named it while five described its symptom.

Summaries move to **P2**. §7 restates the deferral with this as its load-bearing claim.

**2. The novelist's finding is the council's best. Its fix reintroduces the defect progressions exist
to solve.**

A story-level "where this is going", sent on every prose call, is a spoiler at chapter 3 and stale at
chapter 40. That is exactly SPEC §7.1's argument against a permanent body carrying a temporal fact,
and it was Council #1 lens 5's ONE THING.

The destination belongs at chapter scope, where it is true for the window it covers.
`chapters.authors_note` already exists, already rides the style directive at depth, and needs no
schema. It becomes the beat channel explicitly (§6.5). A story-level `direction` exists, is optional,
and **never reaches a prose call** — it steers `summary` and `extract` only (§8).

> **Superseded 2026-08-23.** `direction` DOES reach every prose call — it is the last line of
> SPINE, as `Where this is going: …`. COUNCIL-03 S5 overruled this on the grounds that a
> destination is not a claim about *now*, and Seth confirmed the behaviour is what he wants.
> See `docs/PROMPTS.md` §3.


Optional, because a writer who does not know the ending is not doing it wrong.

**3. The council added roughly thirty items and deleted three. Nobody costed the total.**

Summed, the eight seats put ~55h of additions into a P1 the delivery seat had already re-estimated at
35-55h. That makes P1 90-110h of invisible work — precisely the failure mode Council #1 lens 3 named
and every seat claimed to be defending against. Parallel councils have this blind spot structurally:
each seat adds three things and nobody owns the sum.

So §2 is this plan's deletion list, and P1's scope is set by an exit criterion (§9) rather than by
accumulating everything eight seats wanted.

**4. Two seats disagreed about P1 and the arbitration goes against the UI seat.**

UI: "call P1 a developer harness, do not plan on writing in it." Delivery: "P2's exit criterion is
that Seth writes a real chapter in it for a week." The UI seat's own ONE THING — move spark to P1 —
contradicts its harness framing, since you do not build story creation inside something you discard.
Delivery's criterion wins. P1 is minimal and real.

**5. Depth in tokens is instrumentation, not a number to pick now.**

The chatbot seat is right that PROMPTS scaled AI Dungeon's ~60-token distance to 300-600 and kept the
borrowed claim. It does not follow that 60 is correct for a novel; a chat turn and a paragraph of
prose are not the same unit. P0 measures it (§9 P0). The plan commits to expressing depth in tokens
and to testing two values, not to a value.

**6. "The scene has no row" is real; a `scenes` table is oversized.**

The divider is already what writers type. `passages.is_break` — one boolean — makes it structural,
gives the new-scene mode block something to fire on, and gives revision a unit. A table can come when
something needs to hang off it.

---

## 2. What this plan deletes

Council #2's own standard, from rev 3: *deleted more than it added, which removed three defects by
removing the code.*

| Deleted | Why |
|---|---|
| `reserved_tokens` | SPEC §7.5 step 3 takes `max(reserved, actual)` then releases `max(0, reserved − actual)` immediately, which nets to `actual`. The column influences nothing. Priority ordering does the job. **SPEC correction.** |
| `canon_entry_state` | PK `(entry_id, branch_id)` holds one current row and cannot answer "state as of ordinal 19" at ordinal 45 — contradicting §7.4's own upsert-keyed-by-ordinal. Firing is a pure function of the scan window; scan back `max(window, sticky_for)`. Removes a bug class and makes `buildContext` purity real. **SPEC correction.** |
| `canon_proposals` | The proposal queue is gone (§7.4). The table was its storage. |
| SPEC §7.3's summary split | "Distant at top, recent at tail" — the recent chapter's prose is already in the tail, so its summary there is duplicative. All summaries sit in EARLIER. **SPEC correction.** |
| The notification bell | The ledger is the queue (§7.4). One count on one tab, not a global surface. |
| `reprompt` | The other three actions dispose of a value; reprompt is a 68-second async call with a spinner, a failure state and nowhere specified to put the answer. |
| `priority` on the form | Provably inert until P6. Column stays at a default. |
| The verbatim-prompt pane as a third column | It renders the same prose twice. Drawer. |
| A real service worker | Manifest yes, offline reading when someone asks for it. A no-op SW ships at P1 only to prove streaming survives one. |
| Spice routing by `max_spice` | One local model. Register lines stay; §5.4 replaces routing. |
| Vector recall, universes, relations graph, intra-ledger checks, branch UI | Unscheduled, as before. |

---

## 3. Decisions locked

| Area | Decision |
|---|---|
| Host | Local machine. Not Vercel. |
| Network | Tailscale, `tailscale serve`, HTTPS on `*.ts.net`. No public surface. |
| Tenancy | Two users. **Tailnet membership is not authorization** (§4). |
| Identity | `tailscale whois` on the peer IP. Not injected headers — see §4. |
| Database | Postgres in Docker, `pgvector/pgvector`. **Reasons: pgvector without a later translation, and RLS.** Partial unique indexes are not a differentiator; SQLite has had them since 3.8.0. |
| ORM | Drizzle. Migrations by `generate`, never `push`. |
| Inference | llama.cpp `llama-server`. |
| Prose transport | Native `/completion`, hand-rendered prompt, `"add_special": false`. |
| Structured transport | `/v1/chat/completions` with `json_schema` → GBNF. |
| Token counting | `/tokenize` for prose; `/apply-template` → `/tokenize` for structured. |
| Client | Browser PWA, manifest only. Desktop-first; mobile reads and dispositions. |
| Editor | **Block list**, not a rich-text document (§9 P2). |
| Tavo | Shape reference only. |

---

## 4. Auth, scoping and streaming

**Identity is `tailscale whois` on the peer IP.** Serve's injected headers are forgeable by any
tailnet peer if the app is reachable on its raw port, and PLAN-01's own rule — *simplifying login
does not simplify scoping* — is undone by one forgeable header. Bind loopback only.

Three consequences PLAN-01 missed and this plan books:

1. `whois` needs the host's tailscaled socket and the true peer IP, so **the app runs outside Docker**
   while Postgres runs inside it.
2. Localhost development has no tailnet identity, so a dev bypass exists. It is one env-gated branch,
   it is the second auth path, and it is budgeted rather than pretended away.
3. **An allowlist.** A tailnet is every device Seth ever enrolls plus every node-share recipient.
   `whois` returns a login, not an authorization. One env var, one middleware.

**Streaming, restored.** `consumeStream()` is client-disconnect semantics and locality does not change
it: a closed tab cancels the stream, frees the llama.cpp slot mid-generation, and loses both the
passage and the minute. Server-side consumption, write on finish regardless of the client, and one
keepalive frame during prefill — which doubles as the progress bar for the 10-30s of zero bytes
before the first token (`"return_progress": true`). Resumability stays deleted.

---

## 5. Inference

### 5.1 The server

`/props` is read at connect. **Per-slot `n_ctx` is the authority**, not the configured value: SPEC
§7.3's `T = min(story.max_context_tokens, model.context_window)` must take `model.context_window`
from the slot, or `--parallel` silently halves the budget and the server truncates from the head —
removing the spine facts the product exists to preserve. Story config fails loudly when
`max_context_tokens` exceeds it.

`-c` is sized as `max_context_tokens × slots`. KV quantization (`-fa -ctk q8_0 -ctv q8_0`) is
required, not optional: `--parallel 2 -c 64000` on a 35B is roughly 10GB of f16 KV on top of weights.

`--cache-reuse` and `--slot-save-path` with `/slots/{id}?action=save|restore` are in scope at P1 —
a 1-2s restore against a full reprefill, surviving a server restart.

**Correction to PLAN-01:** llama-server assigns slots by longest-common-prefix
(`--slot-prompt-similarity`), so two stories at `--parallel 2` keep sticky slots. "Reprefills from
scratch" was wrong.

### 5.2 Counting

`/tokenize` is exact for `/completion`. It is **not** exact for `/v1/chat/completions`, where the
template is applied after you count; structured roles go through `/apply-template` first. Counts are
not additive across joins, so per-block counts are stored and the whole-prompt count is authoritative
(§6.3).

### 5.3 Structured output

`json_schema` compiles to GBNF and constrains the sampler, so malformed output is impossible rather
than retried. PLAN-01's "Zod-validated, one retry" is deleted. What remains is semantic failure,
which a retry at the same prompt does not fix — so: constrain, validate, surface to the human. All
four structured roles are human-gated anyway.

Three specifics: the converter ignores numeric `minimum`/`maximum`, so spark's spice level is an
**enum of literals**; `check`'s `entry_id` is a **per-call enum of the manifest's actual ids**, which
deletes the invented-id failure mode; and structured roles need their own sampler set (~temp 0.2),
so sampler config is per-role, not one set per story.

### 5.4 Register, without routing

A local model removes provider terms, not RLHF. The failure is usually degradation to a lower
register rather than refusal, which no routing fixes and only model choice does. Raw `/completion` is
the real mitigation — there is no assistant turn for a refusal to occupy. If P0 finds refusals at 4
and 5, the levers are `logit_bias`, a grammar forbidding the refusal opener, or a different finetune.

**Refusals are detected and never auto-selected.** A refusal that lands as `selected` sits in the
prose context for every subsequent call, teaching the model that this document contains refusals.

---

## 6. The prompt (PROMPTS rev 2 required)

### 6.1 Blocks are named, never numbered

Council #1 killed rev 2's overlapping layers; SPEC rev 4 reintroduced the defect as three
incompatible numberings across two documents. There is one order and it has no integers:

```
SPINE            title, genre, premise, setting          anchor, cap 400
CANON-ALWAYS     always-on story entries
CANON-TRIGGERED  triggered story entries that fired
LORE             universe-scoped entries
RECALL           vector recall
EARLIER          chapter summaries, oldest first
PROSE            recent prose, all but the tail
DIRECTIVE        style + register + chapter beat          anchor, cap 250
TAIL             the final N tokens of prose
MODE             the mode instruction
```

The 45% canon cap covers CANON-ALWAYS, CANON-TRIGGERED, LORE and RECALL. **EARLIER is outside it** —
the ambiguity that made it undefined whether the story's entire history counted against the ledger's
budget.

DIRECTIVE sits **N tokens** above the end, not N paragraphs. P0 finds N.

Delimiters are `<canon>` style, not Markdown `#` headers, which collide with Markdown storage and
invite the model to continue with `## Chapter 13`.

### 6.2 Transport is declared

Prose is one hand-rendered string to `/completion`. There is no system message; `system_block` is the
first text in the buffer. PROMPTS §1's wording is corrected.

When the last line is unfinished, **no MODE block is emitted at all** — the model continues rather
than being instructed to.

### 6.3 One source of ordering truth

The prompt is rendered **only** from `manifest.blocks`. No template string anywhere. Otherwise
PROMPTS' placement becomes a second source of truth that P6 must reconcile, which is the actual
mechanism that would make P6 a rewrite.

Every block carries its own token count, written at write time. `generations` stores the manifest on
every call (§8).

### 6.4 The guard

At P1, before any send: sum block counts, compare against slot `n_ctx` minus output reserve, and on
overflow **refuse and name the block that would be dropped.** Five lines. Without it,
`llama-server` context-shift drops from the head — the CANON block — and the one promise breaks
silently while the app reports success.

### 6.5 Text changes

- **Register 4 and 5 lose their diction clauses.** §3.1 promises these "control explicitness only,
  never voice", then says "in plain language" and "with direct vocabulary" — voice instructions that
  flatten what `writing_style` just paid for. Level 3's "suggestion and aftermath over anatomy" is
  the model: say what reaches the page, not which words.
- **Levels 3 and 4 gain "adult fiction between adult characters."** Only 5 carries it, so a
  safety-tuned model refuses 4 more often than 5.
- **A NEW SCENE mode block**, fired by `passages.is_break`. Every current instruction says *continue*
  — `system_block` says never resolve unasked, Co-Write says do not end the scene, Full Auto says do
  not skip time — so the tool structurally cannot start a scene.
- **The beat line.** DIRECTIVE carries `chapters.authors_note` as "this chapter must end with X".
- **`check` gains one line:** a character lying, being wrong, or speaking figuratively is not a
  contradiction. In-fiction falsehood is the dominant false-positive class in fiction.
- **`system_block`'s arbitration rule inverts.** "The canon wins for fact" resurrects a character the
  prose killed. It becomes: where prose has changed a canon fact, the prose wins and the change is
  proposed as a progression.
- Bind `stop[]` and `n_predict` to the output reserve. "Write 2-4 paragraphs" is not a stop mechanism.
- Merge the style and register bracket lines into one, or the model emits its own stage directions.
- Bind every substitution: `{{pov_subject}}`, `{{max_words}}`, `{{included_entries}}`. Declare each
  role's output shape and enum values.
- `writing_style` accepts **300 words of the writer's own prose**, not one sentence about it. Already
  a text column.

---

## 7. The deferral, restated

### 7.1 What actually bounds the context

PLAN-01 said "concatenate until it stops fitting." That is true for about six chapters. The
mechanism that keeps a book inside 32K without floors, ceilings, trimming or reservation is
**summarization** — old chapters collapse, the recent tail stays whole.

So summaries land at **P2**, and the rule becomes: SPINE + canon + EARLIER summaries + the last N
chapters of prose, concatenated, counted, and refused if over. That carries to chapter thirty rather
than chapter eight, which is what §5 of PLAN-01 needed to be true and was not.

### 7.2 What is still deferred, and its real trigger

The budget engine — floors, ceilings, the 45% cap, the trim ladder, eviction, the three-state
manifest, the meter — stays at P6.

**Its trigger is not overflow.** With canon above prose, one ledger edit invalidates the KV prefix,
so the pain arrives as *prefill got slow*, and it will be misread as a hardware problem. The named
trigger is: first prefill above N seconds, or first call where the prefix moved and the guard fired.

Activation beyond plain keyword match — secondary keys, `key_logic`, proximity, exclusion, regex —
stays at P4+. Tavo ships trigger-words-plus-content to 100k installs; the sophistication arrives on
demand.

### 7.3 SPEC corrections this plan requires

`reserved_tokens` deleted (inert). `canon_entry_state` deleted (cannot answer its own question).
The summary split deleted (duplicative). Layer numbers replaced by block names. The canon-wins-for-fact
rule inverted. These are corrections to SPEC rev 4, not deferrals.

### 7.4 Automatic, corrected

PLAN-01 defended auto-write on the grounds that it is revertible. The harm is not permanence — it is
that a wrong fact is in the prompt for **every generation between the write and the revert**, and
reverting does not unpoison prose already generated. The asymmetry: dismissal-unread under a queue
leaves canon clean; under auto-write it leaves canon dirty.

**The rule, narrowed:**

1. Entries that **do not yet exist** are auto-written. A wrong new entry is additive noise you delete;
   there is no incumbent to corrupt.
2. Any **modification of an existing body** becomes a notification.
3. `entry_type = 'character'` bodies are **never** auto-written, new or not. A model writing a
   character's inner life is the model telling you who your people are.
4. Model overwrites model, never you — and the freeze is **per field**, not per entry, or by chapter
   thirty the stale entries are exactly the protagonists you cared enough to touch.
5. **The ledger is the queue.** One "N changed" count on the ledger tab, scoped to the open story, a
   per-attribute diff — cheap and legible because bodies are bracketed attribute lists — and three
   actions. No global bell, no `reprompt`.

*This narrows what Seth asked for. It is flagged as his to overrule, not the council's to decide.*

---

## 8. Data model

`owner_id` on **every** row. RLS policies on every table with `SET LOCAL app.user_id`, because
per-handler discipline is the thing that gets forgotten.

**P1, exactly:**

```
users              id, tailscale_login UNIQUE, name, created_at
stories            id, owner_id, title, premise, genre, setting, pov,
                   writing_mode, spice_level, writing_style, direction,
                   system_block_override, strip_patterns, status,
                   max_context_tokens, engine_config, model_config, created_at
chapters           id, story_id, owner_id, branch_id, index, title, authors_note,
                   summary, summary_token_counts, summary_covers_through_ordinal,
                   summary_source_hash, status, created_at
                   UNIQUE (story_id, branch_id, index)
passages           id, chapter_id, owner_id, branch_id, slot_key, ordinal,
                   variant_index, selected, author, body, is_break, token_counts,
                   directive, generation_id, created_at
                   UNIQUE (branch_id, ordinal) ; partial unique on selected
passage_revisions  id, passage_id, body, replaced_at
canon_entries      id, story_id, owner_id, title, body, notes, entry_type,
                   activation, keys[], priority, sticky_for, proper_nouns,
                   token_counts, last_editor, created_at, updated_at
canon_entry_revs   id, entry_id, field, previous_value, replaced_at, replaced_by
generations        id, story_id, chapter_id, passage_id, model, role, params,
                   context_manifest, prompt_tokens, completion_tokens,
                   latency_ms, error, created_at
```

Plus `UNIQUE (id, story_id)` on `chapters` and `canon_entries` — required at P1 because
`chapter_canon_pins`' scope rule cannot be a CHECK (Postgres CHECK cannot reference another table)
and its enforceable form is a composite FK that needs those indexes on tables created here.

`stories.direction` is the optional destination. **It never reaches a prose call** — it steers

> **Superseded 2026-08-23.** `direction` DOES reach every prose call — it is the last line of
> SPINE, as `Where this is going: …`. COUNCIL-03 S5 overruled this on the grounds that a
> destination is not a claim about *now*, and Seth confirmed the behaviour is what he wants.
> See `docs/PROMPTS.md` §3.

`summary` and `extract`.

`chapters.summary_token_counts` is a tokenizer-keyed map like every sibling count, not a scalar int.

**P2:** `branches` (spark already creates a primary branch, so this cannot lag P1's writes),
`canon_entry_progressions`.
**P4:** `chapter_canon_pins`.
**P5:** `canon_violations`.
**Unscheduled:** `halfvec` columns, `passage_options` (with Adventure).

---

## 9. Phases, by exit criterion

Each phase is defined by what must be **true** at its end. Feature lists are what that forces in.

**P0 — "We have a number, and the prompt design survived contact." 8-14h.**
Measure first: `llama-bench -p 32768` on the actual GGUF, or `timings.prompt_per_second` off one
`/completion`. That settles `max_context_tokens`, `--parallel` versus serialize, and whether KV
quantization is mandatory. Ten minutes replaces PLAN-01 §9 entirely.

Then the PROMPTS §6 test, made falsifiable: build a corpus (chunk a public-domain novel, generate
its summaries and a ledger) so a chapter-40 context is real rather than filler — this is why 2-4h
was wrong. Pick one countable criterion (POV violations, or register compliance at 4), fix the
sampler settings and seed, generate 10 per condition, and count. Test DIRECTIVE at two token depths.
Also decide the P2 editor architecture, because it determines the passage write path.

**P1 — "One person creates a story from an idea, generates a passage into it, and nothing is lost." 40-60h.**
Docker Postgres, second dev database, Drizzle with `generate`. RLS. `whois` identity, allowlist,
loopback bind, dev bypass. The schema above. Connection panel with `/props`, samplers including DRY
and XTC, and test-connection. Status strip. Spark. Story list and create. Two panes — prose, and a
drawer for the prompt view and the field panel. Hand-rolled `/completion` stream parser, keepalive,
`consumeStream`, persist on finish. Per-block counting, render-from-blocks, the guard. `generations`
on every call. `pg_dump` on a timer. A no-op service worker, to prove the stream survives one.

**P2 — "Seth writes chapter one of a real novel in it, for a week, and it is all still there." 35-55h.**
Chapters and a chapter list. Passages as slots, variants, regenerate keeping every version.
`passage_revisions`. The toolbar — curly quotes and the scene divider first. `is_break` and the NEW
SCENE block. **The four modes**: one switcher over one pipeline, Co-Write, Direct and Full Auto.
**Summaries** (§7.1), on two triggers, passages **or** words. Word count. Markdown and JSON export.
Prose import, so eight chapters written elsewhere during the wait can move in.

**P3 — "Two people write different books at the same time without noticing each other." 20-30h.**
Multi-story, draft and archive, the second tenant's whole path, queue state in the status strip,
advisory locks on concurrent writes into one chapter, character wizard.

**P4 — "A fact pinned in chapter one reaches chapter twenty on its own." 20-30h.**
Entries, keywords, always-on versus triggered, interiority notes, POV force-include, sticky, the live
fire preview. Chapter pins. Full-text search over the book.

**P5 — "The ledger fills itself and I trust what it did." 30-45h.**
Extraction under §7.4's rules. The ledger-as-queue with diffs. Memory collect-versus-inject. Summary
staleness. **Canon violation checking** — moved here from P6+, because it needs the list of entries
that reached the prompt, which under concatenation is all of them, and it is the eval for the one
promise.

**P6 — "The book is longer than the window and it still holds." 40-60h.**
Floors, ceilings, the 45% cap, the trim ladder, eviction, the three-state manifest, the meter,
`priority` beside it. Triggered by §7.2's condition.

**P7 — Interop and polish. 12-20h.**
PWA manifest. ST lorebook and character-card import. Adventure and `passage_options`. Progressions
UI. Offline reading only if someone asks.

---

## 10. Time

**Recomputed and shown, because PLAN-01's calendar and its hours disagreed by 2.5x.**

At 34h/month:

| | Hours | Months | +30% |
|---|---|---|---|
| P0-P2 (a real chapter, kept) | 83-129 | 2.4-3.8 | 3.2-4.9 |
| P0-P3 (two writers, many books) | 103-159 | 3.0-4.7 | 3.9-6.1 |
| All | 205-314 | 6.0-9.2 | 7.8-12.0 |

Higher than PLAN-01's 165-260. The council was right that the reduction against Council #1's 270-400
was mostly definitional, and P1 genuinely grew: it now carries spark, the story list, RLS, the
guard, `generations`, per-block counting and the durability story. **Money: zero, plus electricity
and one `pg_dump`.**

---

## 11. Open questions for Council #3

1. **Does moving summaries to P2 actually replace the budget engine to chapter thirty?** This plan's
   central claim, and it rests on arithmetic nobody has checked: summary length, how many recent
   chapters stay whole, and what a real ledger costs at chapter twenty.
2. **Is the destination correctly placed at chapter scope?** The novelist wanted story scope. This
   plan argues that reintroduces the defect progressions exist for. Who is right?
3. **Is P1 at 40-60h still too big?** It is the phase the council inflated. If it is, what comes out?
4. **Does `whois`-outside-Docker plus a dev bypass actually work**, or has the identity decision just
   traded a forgeable header for two deployment topologies?
5. **§7.4 narrows Seth's explicit ask.** Character bodies never auto-written, modifications always
   gated. Is the asymmetry argument strong enough to justify overruling him?
6. **Is a block-list editor enough to be "a document editor, not a chat frontend"** (SPEC §12), or has
   the differentiator been conceded to save a week?
7. **What in this plan still does not need to exist?** Council #2 proposed thirty additions and three
   deletions. This one deletes eleven. It is still probably too much.
8. Which local model, and does it hold register at 4 and 5?
9. Does self-memory need to be branch-aware?
10. Is `is_break` enough, or does the scene want a row after all?

## 12. Roster

Same eight seats: two users, a local AI engineer, a chatbot engineer, a novelist, two developers, a
UI specialist. Each should verify whether its own Council #2 findings were actually fixed, attack
what is new, and judge whether §1.2's six rejections hold.

---

# Addendum — 2026-08-22, after P0 and the design canvas

**Superseding entries. PLAN-03 inherits these; do not re-litigate them.**

## A. Two surfaces, one engine

Locked. `buildContext` serves both:

- **The document** (desktop-first, chapter-based). This is SPEC §12's differentiator and the hard
  part. Built first.
- **The phone client** (chat-shaped, speaker-labelled turns). The 23-artboard canvas
  `Anansi storytelling system UI` is its spec. Built second.

This costs a second UI and nothing else, because the engine is pure and already returns a manifest
rather than a rendered string. §12 keeps its claim: the document is what nothing else has, and the
phone surface is a companion rather than the product.

**Not adopted from the canvas:** the subscription tier on screen 21 (*Teller, 38k/100k words,
renews 3 Sep*). There is no billing on a two-tenant local build.

## B. What the canvas already settles

Screens this plan never scheduled and should stop pretending to design from scratch: **Search**,
**Model connections**, **Branches & rewind**, **Cast**, **Import**, **Onboarding**, **Empty
library**, **Generating & error** (with `tap to stop` — the cancel COUNCIL-03 K8 filed), and
**Confirm** for destructive actions.

## C. What the canvas does not cover, and the document surface must

1. **Context inspector.** `Context 82% full` is a number; SPEC §7.8 needs per-entry state, reason
   and `firedBy`. Without it "why did my pinned fact not appear" is guesswork.
2. **Chapter properties** — `authors_note`, the chapter beat. Flagged by three councils as a field
   with no screen.
3. **Where this is going** — story-level `direction`. The novelist's finding; drift, not amnesia.
4. **Progressions** — canon with a time axis. Lens 5's ONE THING.
5. **The extraction queue** — "N new / N changed" after a chapter close.
6. **Summaries** — readable and editable; they become the only memory of early chapters.
7. **Canon violation flags** — SPEC §8.4.

## D. Settings the canvas is missing, all measured today

- **Samplers**: temperature, top-p, min-p, DRY, XTC. Connections has keys and fallback order and no
  sampler control. These move prose quality more than the canon engine does.
- **Thinking toggle**: `chat_template_kwargs: {enable_thinking: false}`. Measured as the difference
  between 1,292 characters of prose and **zero** (P0-FINDINGS F5).
- **Context budget**: `max_context_tokens` must be editable and must be ≤ **25,024**, not 32,000
  (F2).
- **Spice is five levels, not a binary.** The canvas has `Content filter: On/Off`, which collapses
  levels 2 through 4 and their distinct register lines.

## E. Overridden by measurement (see `P0-FINDINGS.md`)

§3's prose transport (now `/v1/chat/completions`, not raw `/completion`), §5.1's `/props` rule
(reports global `n_ctx`; divide by `total_slots`), §6.4's guard rationale (the server refuses; it
does not silently truncate — COUNCIL-02 C1 overturned), §7.2's `max_context_tokens`, and SPEC
§10.3's latency figures (deleted).
