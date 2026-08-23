# Council #2 — PLAN-01, 2026-08-22

> **STATUS: HISTORICAL RECORD.** A review event, not a specification — it captures what eight seats
> argued on one day. Cited by name from source comments, so it is load-bearing as a record. Nothing
> here is current guidance; where it conflicts with the code, the code won and this says why.


*Convened at Seth's request against `PLAN-01.md`. Eight seats in parallel, none able to see another.
All eight returned. Roster was Seth's: two users, a local AI engineer, a chatbot engineer, a
novelist, two developers, a UI specialist. I held the pen; the findings are the seats' own, the
convergence and the verdict are mine. Claims about PLAN-01's own text were re-checked by grep before
being recorded here.*

---

## THE CONVERGED VERDICT

**PLAN-01 fixed the infrastructure and lost the product.**

Council #1's verdict was "a decision written down with confidence, never traced to the thing it
touches." PLAN-01 opens by claiming that is no longer true. Three seats independently quoted that
sentence back, at three different sections, and one of them is unanswerable:

> `grep -i "co-write\|full auto\|adventure"` against PLAN-01.md returns **zero hits**.

The four writing modes are the-idea.md's entire "Actual Writing portion", SPEC §9's table, and
SPEC §12 claim 1. PLAN-01 keeps `writing_mode` on the story row, keeps the mode instruction blocks
in §4, schedules "a generate button" at P1 — and never schedules the modes. They are not in §5's
deferral table either, so this is not a deferral. It is an omission that a screen inventory would
have caught, and §8 never wrote one.

The same defect type recurs, and this time it is *internal* rather than inherited:

- **§4 and §6 contradict each other on five items.** §4: `passage_revisions`, progressions,
  `chapter_canon_pins`, copy-on-write and "`owner_id` on every row" go in at P1 "whether or not
  anything reads them yet." §6: the first four are "arriving later," and `owner_id` is on two tables
  out of five. P1 therefore ships `branch_id` and `generation_id` as dangling references.
- **§6 adds per-story `system_block` and calls story-scoping the cache prefix a benefit; §9 calls
  multiple stories thrashing the KV cache a cost.** Same property, sold twice, opposite directions.
- **§9's hours and its calendar disagree by ~2.5x.** P0+P1+P2 = 47-79h; at the stated 34h/month that
  is 1.4-2.3 months, 1.8-3.0 with the 30% adder. §9 says "four to six months," which needs 136-204h.
- **§7.4 overrides SPEC §8.2 entirely on the strength of "you can revert," and the revert table does
  not exist** in either §4's list or §6's.

And the deepest finding came from the seat with no technical remit at all. It is recorded in full
below because no other seat found it and it outranks everything above.

---

## THE CONVERGENCES

Findings reached by three or more seats that could not see each other.

### C1 — Concatenation has no defined overflow behaviour *(5 seats)*

*primary user, local AI engineer, chatbot engineer, delivery developer, backend developer*

§5 defers the budget engine on the rule "concatenate everything… at 32000 with three chapters and a
small ledger, it always fits." Every seat that costed it reached the same place by different
arithmetic: three chapters at 4,000 words is ~16K tokens of prose *before* ledger and summaries, so
32K is the boundary, not comfortably inside it. Overflow arrives around **chapter 4-8**, which is
week two of a real book, and P6 is 85-135 hours away.

What happens then is the part nobody wrote down: `llama-server` either errors or context-shifts, and
context-shift truncates **from the head** — which under PROMPTS §2's order is the CANON block. The
one promise breaks silently while the app reports success. This is Council #1 lens 4 finding 16,
reintroduced by deletion.

**All five prescribed the same fix, unprompted:** at P1, count with `/tokenize`, compare against the
slot's real context, and refuse to send, naming the block that would be dropped. Two hours. It
converts a silent coherence bug into an error message.

The primary user's framing is the one to keep: *the risk is not that P1 bakes in assumptions — it is
that P1 has no defined behaviour on the day it stops fitting.* PLAN-01's open question 6 asked the
wrong question.

### C2 — §7.4's provenance and revert have no schema *(5 seats)*

*second tenant, primary user, novelist, UI, backend developer*

§7.4 discards SPEC §8.2's proposal queue, and its whole argument is that auto-write is safe *because
you can revert*. The revision table it names ("same pattern as `passage_revisions`") is on neither
§4's P1 list nor §6's arriving-later list. `canon_entries` has `created_at` and nothing else — no
`updated_at`, no `last_editor`, no marker for §7.4 point 4's "model-authored fields are marked
visually."

So §7.4's one hard rule — "model overwrites model, never you" — is unimplementable on the schema as
written, and provenance is unreconstructable after the fact. The backend seat calls this "the single
clearest case of the plan's own criterion being violated," since §4's rule is precisely that columns
expensive to retrofit into existing rows go in at P1.

Two seats added failure modes the plan did not consider:

- **The novelist:** the rule rots backwards. Any entry hand-edited stops updating forever, so by
  chapter 30 the stale entries are exactly the protagonists you cared enough to touch. Freeze the
  *field*, not the entry.
- **The chatbot engineer:** §7.4 defends against the wrong harm. The harm is not permanence — it is
  that a wrong fact is in the prompt for *every generation between the write and the revert*.
  Reverting does not unpoison prose already generated.

### C3 — §3's streaming deletions are mis-traced *(4 seats)*

*second tenant, primary user, local AI engineer, delivery developer*

§3 deletes `consumeStream()`, SSE heartbeats and resumability, reason given: "same-machine
connection." That is a category error. `consumeStream()` exists so the server keeps pulling the
model stream after the **client** disconnects — a browser problem, not a Vercel problem. Only the
function-timeout half died with the pivot; SPEC §15.7 admitted the rest and PLAN-01 deleted the
admission.

Three aggravations, one per seat:

- The connection is same-machine for exactly one of the two people it serves. The second tenant is
  on wifi, over a tunnel, closing a laptop lid.
- A closed tab now also frees the llama.cpp slot mid-generation: you lose the passage **and** the 68
  seconds.
- `/completion` emits its first frame only after prefill, so a 32K prompt is 10-30s of zero bytes —
  exactly the shape an idle timeout kills, and exactly where a keepalive doubles as a prefill
  progress bar (`"return_progress": true`).

Keep: consume server-side, persist on finish regardless of the client, one keepalive during prefill.
Resumability stays deleted.

### C4 — Nothing tells either user what the machine is doing *(4 seats)*

*second tenant, primary user, delivery developer, UI*

There is no reachability indicator, no queue state, no cancel, no error surface, and no phase owns
one. Grep finds no user-facing "down", "busy", "queued" or "wait" anywhere. For the second tenant,
"the machine is suspended", "the model is unloaded" and "the app is broken" are the same blank page,
and the only remediation is texting the author. §10 Q7 files the shared-model question as flag
arithmetic; four seats call it a UI question.

llama-server already exposes `/health`, `/props` and `/slots`. One status strip at P1.

### C5 — There is no durability story *(3 seats + 1)*

*primary user, delivery developer, backend developer; second tenant on export*

"backup", "restore" and "volume" appear zero times in either document. The pivot deleted Neon and
silently deleted managed durability with it — and §3's deletion table does not list it, which means
nobody noticed. Docker Postgres is the sole copy of the novel; one volume prune is one lost book.
"Money: zero, plus electricity" is only true because durability moved from a vendor to Seth and was
never booked.

`pg_dump` on a timer plus the Markdown export currently parked at P7 is ~6 hours, and the second
tenant's prose lives on a machine they do not own, do not back up and cannot reach.

### C6 — First run is empty, and spark is two phases too late *(3 seats)*

*UI, primary user, delivery developer*

SPEC §8.1: *"A new story starts with a populated ledger, because nobody fills an empty one."* PLAN-01
§7.2 concedes spark "has no screen; that is all that is missing" — then schedules that screen two
phases after the app can generate. Between P1 and P3 there is no story list, so either exactly one
story exists or rows are made by hand, and the plan says neither.

The UI seat's answer: **the screen already exists.** P1's side panel *is* spark's output shape. The
new code is one prompt already written, one schema, and a "fill this from an idea" button. Hours,
not a phase.

### C7 — `priority` is inert from P4 to P6 *(3 seats)*

*novelist, UI, primary user*

SPEC uses `priority` in exactly three places — shortfall distribution, placement order, reservation
eviction — all of which fire only under contention, which §5 defers to P6. The canon form ships at
P4. So for two phases the writer sets a number that provably changes nothing, which teaches him his
inputs are inert.

This answers §10 Q2 directly: priority means nothing to someone who has never seen a token budget,
and it cannot be explained without one. Cut it from the form, keep the column at a default,
introduce it at P6 beside the meter where it visibly reorders eviction.

---

## THE SINGLE-SEAT FINDINGS THAT MATTER MOST

### S1 — The novelist: there is no destination *(the council's most important finding)*

Verified by grep across all four documents: **"outline", "ending", "destination" and "plot" return
zero hits.** The only "arc" is SPEC §8.3's *"summaries carry arc and delta"* — a backward-looking
instruction about what already happened.

Every prompt in PROMPTS.md points backward: canon, summaries, the prose so far, "continue from it."
Nothing anywhere tells the model what the book is *for*. The premise is a setup, not a destination.

> The known failure of AI-assisted long fiction is not amnesia, it is drift: competent, plausible
> middle that never arrives. This design fixes amnesia and ignores drift. It will help you write
> chapter 50. It will not help you finish a novel.

Fix: a story-level "where this is going" beside `premise`, and make `chapters.authors_note`
explicitly the "this chapter must end with X" channel. Both ride the style-directive slot PROMPTS §3
already reserves. Two form fields and one line of prompt text.

Three more from the same seat, all structural:

- **The tool cannot start a new scene.** `system_block` says never resolve a scene unasked, Co-Write
  says "do not end the scene," Full Auto says "do not skip time." The scene divider is a toolbar
  glyph with no meaning to the engine. Every instruction says *continue*.
- **The scene has no row.** Chapter is too big to revise; passage is a generation turn, an artifact
  of the tool rather than of the book. Every revision verb a novelist uses operates on scenes.
- **No model of revision at all.** No read view, no deletion, no reordering surface, no margin notes,
  no word count anywhere in 1,700 lines, and SPEC's tsvector columns left the build in the §6 delta
  without being rescheduled. Second draft has zero hours.

### S2 — The chatbot engineer: depth-3 is not depth-3

Council #1 verified AI Dungeon injects the author's note **three lines** back — roughly 60 tokens.
PROMPTS §2 places it above the final **three paragraphs** of novel prose: 300-600 tokens. Recency
dominance is distance-dependent. The design scaled the distance 5-10x and kept the borrowed claim.

Worse: PROMPTS §2's own fallback moves the directive to the top when fewer than three paragraphs
exist, so **the chapter-1 arm of the P0 test does not test depth at all.** Specify depth in tokens
(~150-250) and let paragraph count fall out.

### S3 — The chatbot engineer: the auto-write fix that keeps Seth's ask

§7.4's harm is not permanence, it is the poisoned window between write and revert. The asymmetry the
plan misses: dismissal-unread in a queue leaves canon *clean*; dismissal-unread under auto-write
leaves canon *dirty*.

**Auto-write only entries that do not yet exist** — a wrong new entry is additive noise you delete,
and there is no incumbent to corrupt. Route every *modification of an existing body* to the
notification. No new UI; §7.4 step 3 already has the surface. The destructive case is specifically
chapter 12's shallow read of Marek silently replacing chapter 3's.

The novelist reaches the same wall from the other side: bar `entry_type = character` bodies from
in-place write entirely. A model auto-writing a character's inner life is the model telling you who
your people are.

### S4 — The local AI engineer: §9 is inherited arithmetic

"68 seconds at 32K" and "7.8 minutes at 188K on a 35B" trace COUNCIL-01 lens 3 → SPEC §10.3 →
PLAN-01 §9 **verbatim, with no hardware, no quant and no backend named at any hop.** Both imply
~400-470 tok/s prefill: plausible for partial CPU offload, wrong by 3-6x for a fully-offloaded Q4 on
a modern GPU. And 188K KV on a 35B is >30GB at f16 — the configuration that number describes
probably cannot be instantiated.

That paragraph sets `max_context_tokens`, `--parallel` versus serialize, and P0's tolerability.
`llama-bench -p 32768` on the actual GGUF replaces it in ten minutes.

Four llama.cpp features that decide whether §5, §7 and §9 work, absent from the plan entirely:

| Missing | Why it matters |
|---|---|
| `-fa -ctk q8_0 -ctv q8_0` | `--parallel 2 -c 64000` on a 35B is ~10GB of f16 KV *on top of weights*. Without quantization §9's own sizing rule is unaffordable on the hardware it was written for. |
| `--cache-reuse N` | KV-shift reuse across a changed middle section — exactly the sliding-prose-window case. |
| `--slot-save-path` + `/slots/{id}?action=save\|restore` | Persists a slot's KV to disk: ~1-2s restore against a 68s reprefill, and it survives a server restart. |
| GBNF / `json_schema` | Constrained decoding makes malformed structured output impossible rather than retried. |

Two corrections to PLAN-01's stated facts: §9's "reprefills from scratch" is **wrong** — llama-server
assigns slots by longest-common-prefix (`--slot-prompt-similarity`), so two stories at `--parallel 2`
each keep a sticky slot. And `/tokenize` is exact for `/completion` but **not** for
`/v1/chat/completions`, where the template wrapper tokens are applied after you count; use
`/apply-template` → `/tokenize` for structured roles.

Better argument for §2's transport split than §2 gives: raw `/completion` **is the anti-refusal
mechanism** — there is no assistant turn for a refusal to occupy. That is the real local replacement
for the spice routing §3 deleted.

### S5 — The backend developer: what makes Q6 true instead of half-true

The manifest *shape* survives; the plan's claim fails where it matters. SPEC §7.8 requires
`layers[].floor/ceiling`, `entries[].tokensUsed`, `totals.layerBase/unallocated`, `overflowed` and
`effectiveScanWindow` — all budget-engine outputs, all null for five phases, with every consumer
written against their absence.

Three things P1 must do, none of them scheduled, that make P6 additive rather than a rewrite:

1. **Count and persist per block**, not per prompt. Counts are not additive across joins (SPEC §7.5
   already budgets `join_overhead` for this), so P6's per-entry accounting cannot be derived from
   P1's totals. Cost now: one `/tokenize` per block at write time. Cost at P6: a migration plus a
   backfill against rows whose generating model may have changed.
2. **Render the prompt only from `manifest.blocks`**, never from a template string — otherwise
   PROMPTS §2's depth-3 placement becomes a second source of ordering truth that P6 must reconcile.
3. **The C1 overflow guard.**

And `generations` deferred **destroys P6's own trigger condition**: the mechanism that detects
overflow is SPEC §7.5's drift check comparing `manifest.totals.used` against
`generations.prompt_tokens`, and that table is on the deferred list while `passages.generation_id`
sits in the P1 schema. §3 already deleted the 90-day retention that made it expensive. One table,
one insert per call, at P1.

Four schema findings the plan and SPEC both missed:

- **`chapter_canon_pins`'s scope constraint cannot be a CHECK.** Postgres CHECK cannot reference
  another table. The enforceable form is a composite FK carrying `story_id`, which requires unique
  indexes on `(id, story_id)` — **on tables created at P1**, even though the pin table is deferred.
- **`reserved_tokens` is inert.** SPEC §7.5 step 3 takes `max(reserved, actual)` then releases
  `max(0, reserved − actual)` *immediately*, which cancels itself: a floor must hold against other
  entries' placement and release after the entry resolves. Delete the column; priority ordering does
  the job.
- **`canon_entry_state` should not exist.** Its PK `(entry_id, branch_id)` holds one current row and
  cannot answer "state as of ordinal 19" while the branch is at 45 — which contradicts §7.4's own
  "upsert keyed by ordinal." Firing is a pure function of the scan window; scanning back
  `max(window, sticky_for)` derives it. Deleting the table removes a bug class and makes
  `buildContext`'s purity real rather than qualified.
- **Missing and cheap now:** `stories.created_at`, `chapters.created_at`, `unique(branch_id,
  ordinal)` (absent which two tabs racing duplicate the ordinal every engine count is denominated
  in), `unique(story_id, branch_id, index)`, `unique(users.tailscale_login)`. And
  `chapters.summary_token_count` is a scalar int while every sibling count is a tokenizer-keyed map.

**Postgres is right for reasons PLAN-01 does not give.** "Partial unique indexes" is a false
differentiator — SQLite has had them since 3.8.0. The arguments that hold are pgvector without a
translation, and **RLS**: `SET LOCAL app.user_id` with one policy per table, which is impossible to
forget, where §6's `owner_id`-on-two-tables plus per-handler discipline is not. RLS is the strongest
argument available and neither document makes it.

### S6 — The delivery developer: P2 is specced as a document and sized as a block list

SPEC §12 says the *only* thing separating this from SillyTavern is that it is "a chapter-based
document editor, not a chat frontend." A model streaming into the middle of a document while the
writer edits around it, each passage a separately-versioned row, is not a textarea. Either
ProseMirror-class machinery (a week before you are dangerous) or a list of independently-editable
blocks — cheap, and then it *is* a chat log with better fonts.

25-40h assumes the second and claims the first. **Decide at P0: it determines the passage write path,
not the CSS.**

Also from this seat, and unbudgeted: the AI SDK does not parse llama.cpp's native `/completion`
frames, so P1 hand-rolls a stream parser. `tailscale whois` needs the host's tailscaled socket and
the real peer IP, so **it forces the app out of Docker** while Postgres is in it. Localhost dev has
no tailnet identity, so P1 ships a dev bypass — a second auth path, the exact thing §3 congratulated
itself for deleting. And if Next.js binds `0.0.0.0` behind the proxy, any tailnet peer can forge the
identity header and become Seth.

### S7 — The second tenant: the tailnet is not an allowlist

§2's "the tailnet is the invite list" conflates two closed sets. Deleting the invite *flow* was
right; deleting the *check* was a different decision, taken silently. `tailscale whois` returns a
login, not an authorization, and a tailnet is every device Seth ever enrolls, every node-share
recipient, every family phone. One env var of permitted logins in one middleware. Ten lines.

Related, and a correctness bug rather than the hardware arithmetic §10 Q7 files it as: nothing
computes the model's real context from a llama.cpp **slot**. SPEC §7.3 defines
`T = min(story.max_context_tokens, model.context_window)`; if `--parallel` halves the slot and
nobody reads `/props`, a 32000-token story silently truncates from the left — SPEC §7.5's own named
failure — while the meter computes floors against a base that quietly halved.

### S8 — The UI specialist: the screen inventory the plan owes

Twenty-one screens, six of them in no phase. Missing entirely: **the manual story create/edit form**
(§6 gives `stories` eleven author-facing columns and no phase renders them); **story settings** for
`system_block` and the strip-patterns textarea; **chapter properties including `authors_note`**,
which PROMPTS §3 injects into every prose call from a field with no screen anywhere; **progressions
UI** (§4 builds the time axis at P1 and §8 never surfaces it, where SPEC M5 did); **chapter pins**;
and the **mode switcher**.

Two judgements worth keeping:

- **The notification model pays the review-gate cost and gives up the safety anyway.** §7.4 rejects
  the proposal queue as "a review-gate UI costing real hours," then P5 ships "the notification queue
  with accept/edit/delete/reprompt" — which *is* a review gate, except the write already landed. No
  diff surface is specified, so "accept" means accepting something you did not read. Make the ledger
  itself the queue, scoped to the open story, with a per-attribute diff — cheap and legible precisely
  because SPEC §7.2 bodies are bracketed attribute lists. And **reprompt is the wrong shape**: the
  other three dispose of a value, reprompt is a 68-second async call with a spinner and nowhere to
  put the answer.
- **A debug view does not grow into the meter.** P1's view answers *what exactly was sent* — verbatim
  text, for a developer. SPEC §7.9's meter answers *why my pinned fact did not appear* — an
  aggregate, for a writer. Verbatim text does not aggregate. The growth story also runs backwards:
  §5 says P1's manifest has one layer and no trimming, so the viewer has nothing to grow *into* and
  gets rewritten twice. But P4's live fire preview already **is** the meter's entry list with real
  `firedBy` values — build it as that component.

On §10 Q4: the PWA's stated reason in the-idea.md is distribution — "no App Store gatekeepers" —
and PLAN-01 dissolved that reason by moving to two users on a tailnet, where the answer is a
bookmark. What survives is the manifest. Make P1's side panels **drawers rather than columns**; that
free CSS decision at P1 is the whole mobile retrofit.

---

## WHERE THE SEATS DISAGREE

Recorded rather than averaged.

1. **Service worker timing.** UI: "service worker last, right for the reason given." Delivery: SPEC
   §13's words are *"verify early"*, and P7 cites the warning as though citing were compliance —
   ship a no-op SW at P1 and prove the stream survives it. **Delivery is right**; SPEC's own text
   settles it. Also unverified: whether Chrome still gates `beforeinstallprompt` on a SW with a fetch
   handler, which would mean "manifest early, SW last" cannot be separated at all.
2. **Q6.** Delivery: `buildContext` pure from P1 *is* the answer, the frontend consumes a manifest
   from day one. UI: two artifacts, two readers, it does not grow. Backend reconciles both: the shape
   survives **only if** P1 also counts per block, renders from `manifest.blocks`, and guards
   overflow. Adopt the backend's version.
3. **Postgres.** Backend agrees with the conclusion and rejects the stated reasons. Right answer,
   wrong argument, and the strongest argument (RLS) is unmade.

---

## WHAT SURVIVED

Attacked and unbroken:

- **P0 before any code** — every seat that mentioned it. The only falsifiable claim in the plan and
  correctly placed first. Three seats add that 2-4h under-books it: an honest chapter-40 context has
  to be *written* before it can be assembled.
- **The five register lines** (PROMPTS §3.1) — "the best text in either document; each names its
  failure mode, not just its permission." *(chatbot)*
- **"Do not restate them as exposition; write as though the reader already knows them"** — the
  standard fix for lorebook-dump prose, first try. *(chatbot)*
- **"Do not end the scene" / "Do not narrate past the instruction" / "Do not resolve it faster than
  the scene wants"** — "whoever wrote those has sat with the problem." *(novelist)*
- **Regenerate keeps every version** — the one thing writers reliably want back. *(novelist)*
- **`notes` never reaches the model** *(novelist)*, **bracket-format bodies** *(novelist, UI)*,
  **toolbar order** *(novelist, UI, delivery — traces cleanly to the-idea.md)*.
- **Interiority as `canon_entries`** — no new schema, genuinely free. *(backend)*
- **"Building two wizard frameworks would be one too many"** *(UI)*.
- **Fractional `slot_key` with separate monotonic `ordinal`**, **the partial unique index with
  unset-then-insert**, **`token_counts` as a tokenizer-keyed map** *(backend, delivery, local AI)*.
- **Deleting the browser-side generate path** — removes a whole client-trust surface. *(delivery)*
- **`tailscale serve` HTTPS on `*.ts.net`** — genuinely solved, and quietly load-bearing since a PWA
  needs a secure context. *(second tenant, delivery)*
- **`-c` sized as `max_context_tokens × slots`** — the flag reading is correct. *(local AI, delivery)*
- **Output cleanup as one textarea, not a regex engine** *(user, delivery)*.
- **`check` flags and never rewrites** — "tried to argue for auto-fix, could not." *(chatbot)*
- **Q7's answer is `--parallel 2` at half context**, conditional on KV VRAM: batched decode is near
  free per extra sequence, while serializing makes user B wait out user A's full prefill *and*
  generation. *(local AI)*
- **Deferring secondary keys, `key_logic`, exclusion and regex keys** — "I would never have set
  them." *(primary user)*

---

## WHAT PLAN-01 MUST ANSWER

In the order the council would fix them:

1. Schedule the four writing modes. Say whether Adventure is in or out.
2. Reconcile §4 against §6, item by item, and say what actually ships at P1.
3. Add the C1 overflow guard, the C2 provenance columns, `generations`, and per-block counting to P1.
4. Give the model a destination (S1). Two fields, one prompt line.
5. Fix §9's arithmetic, and replace its inherited latency numbers with one measurement.
6. Decide P2's editor architecture before P0 ends.
7. Rewrite P0 so it can falsify something: declare the transport, express depth in tokens, count a
   criterion across n samples at fixed sampler settings.
8. Restore server-side stream consumption, persist-on-finish, and one keepalive.
9. `pg_dump` on a timer and Markdown export, before the first real chapter exists.
10. An allowlist, a status strip, and a story list — each of which is under an hour.

No proof of concept until 1 through 3 are answered. The rest can be answered in the building.
