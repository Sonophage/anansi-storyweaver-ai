# Anansi — Plan 01

The build plan, rewritten against the decisions made 2026-08-22. `SPEC.md` revision 4 remains the
engine reference; this document overrides it on host, auth, inference, client and build order.

Input documents: `the-idea.md`, `SPEC.md` (rev 4), `PROMPTS.md`, `COUNCIL-01.md`.
Intended reader: Council #2. Nothing here has been costed or attacked yet.

---

## 1. What changed

SPEC rev 4 assumed a hosted product: Vercel, Neon, OpenRouter, invite-only signup, and local
inference bolted on through the browser to work around a network-topology problem. That assumption
is withdrawn.

**Anansi is a local-first application on Seth's own hardware, reachable by two people over
Tailscale, generating from a local llama.cpp, delivered as a browser PWA.**

Every deletion in section 3 follows from that one sentence.

---

## 2. Decisions locked

| Area | Decision |
|---|---|
| Host | Local machine. Not Vercel. |
| Network | Tailscale. Serve over HTTPS on `*.ts.net`. No public surface. |
| Tenancy | Two users. The tailnet is the invite list. |
| Identity | Read off the peer — `tailscale whois` on the client IP, or Serve's identity headers. Verify which before building. |
| Database | Postgres in Docker, `pgvector/pgvector` image. Not SQLite. |
| ORM | Drizzle. Unchanged. |
| Inference | llama.cpp `llama-server`, already installed. Not Ollama, not OpenRouter. |
| Prompt transport | Native `/completion` for prose. `/v1/chat/completions` for structured roles. |
| Token counting | llama.cpp `/tokenize`. Exact, same model as generation. |
| Client | Browser PWA. Desktop-first document, mobile read plus light interaction. |
| Framework | Next.js App Router, TypeScript. Unchanged. |
| Tavo | Shape reference only. No integration, no fork, no MCP, no OpenAI-compatible endpoint. |

**Postgres over SQLite** is a recommendation Seth did not contest, not a decision he made. It buys
jsonb, `text[]`, partial unique indexes and `halfvec` — the exact target schema, no translation at
the vector milestone — for the price of one `docker run`. Open to attack (§10, Q1).

---

## 3. What local-first deletes

| Deleted | Why it existed | Why it goes |
|---|---|---|
| Vercel, Fluid compute, the 300s ceiling | Hosted runtime | Not a serverless function |
| Neon, free-tier budgeting, CU-hour cap | Hosted database | Local Postgres, local disk |
| 90-day `context_manifest` retention | Neon free tier | Disk is not the constraint |
| The browser-side generate path (SPEC §2.1) | A Vercel Function cannot reach a LAN | The server *is* on the LAN. One path again. |
| `generations.source` = server/client | Two paths, one untrusted | One path, trusted |
| Auth.js, `accounts`, `sessions`, `verification_tokens` | Hosted signup | Tailscale identity |
| `invites` and the invite flow | Closed user set | The tailnet is the closed set |
| Nodemailer / magic links | Auth.js requirement | Gone with it |
| `user_provider_config` encryption | Third-party API keys at rest | No third-party keys. Base URL in config. |
| `consumeStream()`, SSE heartbeats, resumability | Serverless disconnect semantics | Same-machine connection |
| `js-tiktoken`, `cross_tokenizer_multiplier` | Counting with the wrong tokenizer | `/tokenize` is the right one |
| `model_capabilities` cost columns, `cost_usd` | Billing | Local inference has no per-token cost |
| Spice routing via `max_spice` | Hosted providers refuse | One local model, chosen once. Register lines stay. |
| Prompt caching as a billing saving | Cache-read pricing | Becomes KV reuse and prefill time. Same design advice, different payoff. |
| OpenRouter | Hosted inference | Keep the seam, not the dependency |

**Not deleted, moved:** SPEC §10.4's "freeze layer 1 for the chapter" survives intact. llama.cpp
reuses the KV cache across a shared prefix, so prefix stability now buys seconds of prefill instead
of dollars. Same rule, better reason.

---

## 4. What survives, and why

These are the SPEC decisions that are expensive to retrofit. They go in at P1 whether or not
anything reads them yet.

- **`buildContext` is pure.** Plain objects in, manifest out. No DB, no network. The §2.1 argument
  is gone, but the testability argument is stronger: the entire engine can be tested with no
  database and no model.
- **Fractional `slot_key`, separate monotonic `ordinal`.** Insert-mid-chapter must never renumber.
  All engine counts use `ordinal`.
- **`branch_id` on every row, copy-on-write forks.** Lens 4 proved fork-by-reference rewrites the
  parent branch. Schema now, UI whenever.
- **One selected variant per slot, partial unique index, unset-then-insert write order.**
- **`token_counts` as jsonb keyed by tokenizer id.** Lens 4 forced this to survive mixed
  tokenizers; it now holds the gguf id and makes cached counts cheap.
- **`passage_revisions`.** Editing in place destroys history. Also the mechanism the notification
  model's revert depends on (§7.4).
- **Progressions** (`canon_entry_progressions`). Canon needs a time axis or chapter 3 leaks
  chapter 7. Lens 5's ONE THING. Cheap now, a rewrite after placement exists.
- **`owner_id` on every row, and the `chapter_canon_pins` scope constraint.** Two tenants makes
  SPEC §7.1's cross-user leak live rather than theoretical. **Simplifying login does not simplify
  scoping.** These are different problems and it would be easy to conflate them.
- **`PROMPTS.md` entirely.** The register lines, the depth-3 placement, the mode instruction
  blocks, the four structured roles. Unchanged.
- **SPEC §12's honesty discipline.** Applies to feature lists as much as to marketing.

---

## 5. What gets deferred harder than SPEC says

Tavo is a mature product in this exact space — 100k+ installs, 4.5 stars — and its lorebook is
**trigger words plus content**. No token budget, no insertion depth, no priority, no secondary
keys, no scan depth, no recursion.

That is not an argument that SPEC §7 is wrong. Tavo is doing chat, where context churns every few
turns and coherence at chapter 50 was never the goal. §7 earns its complexity against a promise
Tavo does not make.

It *is* an argument about order. A hundred thousand people are getting useful work out of the
simplest possible engine, which means the sophisticated one can arrive on demand rather than up
front.

| Deferred to | What |
|---|---|
| P6 | The budget engine: layer floors, ceilings, the 45% cap, reservation, the trim ladder, eviction, the full manifest |
| P4 | Activation beyond plain keyword match: secondary keys, `key_logic`, proximity bounds, exclusion keys, regex keys |
| P6+ | Canon violation checking (SPEC §8.4). Still the most original idea in the spec. Needs a manifest to check against. |
| unscheduled | Vector recall, universes, relations graph, branch UI, intra-ledger contradiction check |

**The rule that replaces the budget engine until P6:** concatenate everything, count it with
`/tokenize`, and show the number. At `max_context_tokens = 32000` with three chapters and a small
ledger, it always fits. The engine ships the week it stops fitting, with real numbers instead of
the roughly fifteen constants SPEC §15 admits are guesses.

**The risk this takes on** is that concatenation bakes in assumptions that make the engine a
rewrite rather than an addition. Mitigation: `buildContext` exists from P1 and returns a manifest
from P1. At P1 the manifest has one layer and no trimming. Its shape does not change; its contents
grow. This is the sharpest charge available against this plan and Council #2 should press it (§10,
Q6).

---

## 6. Data model delta

Starting tables at P1 — four, plus users:

```
users            id, tailscale_login, name, created_at
stories          id, owner_id, title, premise, genre, setting, pov,
                 writing_mode, spice_level, writing_style, system_block,
                 status, max_context_tokens, engine_config, model_config
chapters         id, story_id, branch_id, index, title, authors_note,
                 summary, summary_token_count,
                 summary_covers_through_ordinal, summary_source_hash, status
passages         id, chapter_id, branch_id, slot_key, ordinal, variant_index,
                 selected, author, body, token_counts, directive,
                 generation_id, created_at
canon_entries    id, story_id, owner_id, title, body, notes, entry_type,
                 activation, keys[], priority, sticky_for, proper_nouns,
                 token_counts, created_at
```

Added to SPEC's story row: **`system_block`**. Seth asked for the model's own instructions to be
editable per story. One column, and it makes the cache prefix story-scoped rather than global.

Arriving later, in the migration that needs them: `branches`, `passage_revisions`,
`canon_entry_progressions`, `canon_proposals`, `canon_entry_state`, `chapter_canon_pins`,
`generations`, `canon_violations`, `halfvec` columns.

**This deliberately breaks SPEC §13's "schema complete in one migration."** That rule existed
because lens 1 found six schema decisions deferred past the migration that had to contain them. The
distinction: columns that are expensive to retrofit into *existing rows* go in now (§4). Tables that
do not exist yet have no rows to migrate, so creating them later costs nothing. Open to attack.

### 6.1 Interiority needs no new schema

"Small notes that can be keyword triggered" is a `canon_entry` with `entry_type = 'character'`,
`activation = 'triggered'`, a short body and a few keys. A character ends up with one always-on
identity row and N triggered interiority rows. That is how SillyTavern and Novelcrafter users
already work.

The only new thing is a UI affordance — "add a note about Marek" creating a pre-linked triggered
entry — which is a form default, not a feature. Biasing extraction toward interiority is a wording
change in `PROMPTS.md` §5 `extract`, not a code change.

Interiority that *changes* is a progression, not a new note. That is the one part of this that is
not free.

---

## 7. What is new

### 7.1 A connection and sampler panel

SPEC carries `model_config` as jsonb and schedules no UI for it in any milestone. On hosted
inference that is survivable. On local hardware it is a hole: temperature, top-p, top-k, min-p and
repeat penalty move prose quality more than anything in the canon engine, and unlike hosted, they
are yours.

One screen: base URL, model, context length, sampler values, test-connection. Minimal version lands
at P1 because you cannot generate without it.

### 7.2 Two wizards, one mechanism

**Story wizard is `spark`** — already specified in SPEC §8.1 and written in `PROMPTS.md` §5. One
structured call, every field editable before accept, and on accept it creates the story, its primary
branch, and an always-on entry per character with `sticky_for = 3`. It has no screen; that is all
that is missing.

**Character wizard is a genuine gap.** SPEC only makes characters as a byproduct of spark; there is
no way to add one to an existing story. It is the same shape though — one new role in `PROMPTS.md`
§5, output is a `canon_entry` plus its triggered interiority notes, same edit-before-accept screen.

Building two wizard frameworks would be one too many.

### 7.3 Memory: collect always, inject optionally

Tavo accumulates long-term memory while injection is switched off. That separation is worth copying
exactly, because it is the A/B test for free: collect from day one, toggle injection, read the
prose.

It is also the gate Seth set on **the model's own running notes** — keep it only if it brings value
and cohesiveness. Do not build a table for it. Loosen the `summary` prompt to carry one
"what I am tracking" line and see whether the prose improves. A third artifact has to beat the
chapter summary sitting next to it, and until the book is long it probably cannot.

### 7.4 Automatic, with a notification

SPEC §8.2 is emphatic that extraction must never auto-accept, because "auto-writing canon lets the
model pin its own hallucination as permanent truth." Seth asked for auto-write. **These do not get
averaged; §8.2 loses, and here is why.**

§8.2's fear is about *permanence*, not authorship. Auto-writing into a field you read every session
and can revert is not permanent. The proposal queue is a review-gate UI costing real hours, and it
pays off only for a writer who never opens the ledger — which is not the writer being built for.

The replacement:

1. Extraction writes in place.
2. The previous value is kept as a revision row. Same pattern as `passage_revisions`, no new concept.
3. A notification says what changed. Actions: **accept, edit, delete, reprompt.**
4. Model-authored fields are marked visually.

**One hard rule: model overwrites model, never you.** If a field has been hand-edited since the
last extraction run, the model's version becomes a notification instead of an in-place write.
Otherwise a hand edit silently loses a coin flip against the next chapter close.

Notification fatigue at chapter 20 is a real risk and Council #2 should size it (§10, Q3).

### 7.5 Import

Tavo reads SillyTavern World Info, and character cards in Spec V1/V2/V3 across PNG, JSON and CHARX.
A large public corpus exists. Seeding a ledger from an ST lorebook instead of typing it is the same
class of item lens 3 flagged export as: very high value per hour, on no milestone.

Both import and export land at P7. Export is roughly four hours and backs the only claim in SPEC
§12 that currently has no mechanism.

### 7.6 Output cleanup

Local models emit `<think>` blocks and stray template tokens. Tavo solves this with a full regex
engine. One "strip these patterns" textarea on the story row covers it. Do not build the engine.

---

## 8. Build order

**P0 — The prompt test. One evening, no code.**
`PROMPTS.md` §6, unchanged and still first. Hand-assemble chapter 1, 12 and 40 against the actual
local model. Check that canon reaches the prose without being restated as exposition, that the
register line holds at 4 and 5, that the model stops where told, and **run depth-3 placement against
top placement and compare**. That last one is inherited from AI Dungeon and NovelAI on the strength
of their convergence and has never been tested here. It is the cheapest falsifiable claim in the
design and nothing downstream is cheap to unwind.

**P1 — The slab. One page, real data.**
Docker Postgres, Drizzle, the five tables above. Tailscale identity. Connection panel. One page: a
prose pane, a side panel of plain fields for every prompt block, the rendered prompt shown verbatim
with a real `/tokenize` count, and a generate button streaming from `/completion`.

No budget engine. No triggers. No slots or variants. `buildContext` exists, is pure, and returns a
one-layer manifest.

This *is* the P0 test made interactive, and it does not get thrown away. Run P0 by hand first
anyway — it can tell you the prompt design is wrong, which changes what this page renders.

**P2 — The document.**
Chapters, passages as slots, variants, regenerate keeping every version, the toolbar (curly quotes
and a scene divider first, then bold and italic). Fractional keys, the partial unique index, the
write order. `passage_revisions`.

This is where it stops being a prompt toy and becomes the thing SPEC §12 claims it is.

**P3 — Wizards and stories.**
Structured output against `/v1/chat/completions`, Zod-validated, one retry. Spark. The character
wizard. The story list, draft and archive.

**P4 — Canon that fires.**
Entries with keywords. Always-on versus triggered. Interiority notes. POV force-include. Sticky.
Plain whole-word matching over a stem set, proper nouns exempt. The live fire preview — trigger
rules are hard to reason about and easy to understand when you watch them fire.

Not yet: secondary keys, `key_logic`, proximity bounds, exclusion keys, regex keys.

**P5 — Automatic.**
Extraction into entries. Summaries on two triggers, passages **or** words, both derived from the
window. The notification queue with accept/edit/delete/reprompt. Memory collect-versus-inject.
Summary staleness via `summary_source_hash`.

**P6 — The engine.**
Only when P1's concatenation is overflowing. Layer floors and ceilings, the 45% cap, reservation as
a floor inside placement, the trim ladder, eviction order, the three-state manifest, and the
manifest inspector the crude prompt view has been growing into since P1. Then SPEC §8.4's canon
violation checking, which needs a manifest to check against.

**P7 — PWA and interop.**
Manifest and install prompt (cheap, could land any time). Service worker last — SPEC §13 warns
service workers and streaming POSTs interact badly, and there is no fallback client. Offline
reading only. ST lorebook and character card import. Markdown and JSON export.

---

## 9. Time, cost, hardware

**These hours are mine and nobody has costed them.** Lens 3 did the original estimate with far more
rigour than this. The operator seat should attack them first.

At the SPEC assumption of about 8 hours a week, 34 hours a month:

| Phase | Est. hours |
|---|---|
| P0 | 2-4 |
| P1 | 20-35 |
| P2 | 25-40 |
| P3 | 15-25 |
| P4 | 20-30 |
| P5 | 25-40 |
| P6 | 40-60 |
| P7 | 15-25 |
| **Total** | **165-260** |

Add 30% for discovered work. Against SPEC rev 4's 280-430 to M7, the difference is almost entirely
the hosted infrastructure that no longer exists.

**Something usable to write in arrives at the end of P2** — perhaps 50-80 hours, call it four to six
months at this cadence. That matters more than the total. Lens 3's warning stands: the failure mode
for a solo project is a long stretch of engine work with nothing on screen.

**Money: zero, plus electricity.** Maintenance should fall well below SPEC's 6-12h/month, since
forced provider migrations were most of it.

**Hardware is the real budget.** `llama-server` serializes unless run with `--parallel N`, and `-c`
is split *across* slots. Two tenants at `--parallel 2` means each gets half the configured context.
Size `-c` as `max_context_tokens x slots`. Verify the flag semantics against the installed build.

`max_context_tokens = 32000` keeps generation near 68 seconds locally, against roughly 7.8 minutes
at 188K on a 35B model. It was the single largest cost lever in the hosted design; here it is the
single largest *latency* lever, and the reason for keeping it does not change.

**Multiple stories thrash the KV cache.** Two people alternating between several stories means the
shared prefix changes on nearly every request, so llama.cpp reprefills from scratch. Mitigations are
boring — enough slots that an active story keeps one, or accept the reprefill and keep the context
small.

---

## 10. Open questions for Council #2

1. **Postgres or SQLite?** Postgres is one `docker run` and the exact target schema, including
   `halfvec` for a vector milestone that is currently unscheduled. Is the daemon worth it for two
   users, or is SQLite correct until vectors actually land?
2. **Does the six-field entry form survive a novelist?** Lens 3 cut eighteen fields to six. Is six
   still too many, and is `priority` meaningful to someone who has never seen a token budget?
3. **Notification fatigue.** Auto-write plus a notification is cheaper than a proposal queue at
   chapter 3. At chapter 20, with extraction running per chapter close across several stories, does
   it become noise that gets dismissed unread — which is strictly worse than the queue §8.2 asked
   for?
4. **Desktop-first, mobile-read.** A PWA will not match a native app for long-document editing.
   Is accepting that the right call, or does it hollow out the reason to be a PWA at all?
5. **Interiority as `canon_entries`.** One always-on identity row plus N triggered note rows per
   character. Does that stay legible at thirty characters, or does it want its own surface?
6. **Is deferring the engine to P6 correct?** The claim is that `buildContext`'s manifest shape does
   not change, only its contents. The counter-charge is that concatenation quietly bakes in
   assumptions — ordering, no trimming, no reservation — that make P6 a rewrite of P1 through P5
   rather than an addition. This is the sharpest available attack on this plan. Press it.
7. **Two tenants, one llama.cpp.** Slot count, context splitting, queue behaviour when both write at
   once. Is `--parallel 2` at half context better or worse than serializing at full context?
8. **Does the model's running notes idea survive at all**, or does the chapter summary already do
   the job?
9. **Which local model, and does it hold register at spice 4 and 5?** Local means no provider terms.
   It does not mean no refusals, and it does not mean the prose is any good.
10. **Does self-memory need to be branch-aware?** Canon state is keyed `(entry_id, branch_id)` for
    good reason. Memory extracted on a branch that was later abandoned is the same class of bug as
    vector recall surfacing a discarded variant.
11. **Tailscale identity mechanism.** `tailscale whois` on the peer IP, or Serve's injected headers?
    One of these is right and this plan does not know which.
12. **What is the actual first-run experience?** Spark is at P3. Between P1 and P3 a story is created
    by typing into empty fields, which SPEC §8.1 explicitly says nobody does.

---

## 11. Council #2 roster

Eight seats, as specified:

- Two users
- A local AI engineer
- A chatbot engineer
- A novelist
- Two developers
- A UI specialist

Council #1 ran five lenses, one adversarial, and every lens found the same shape of error: a
decision written down with confidence and never traced to the thing it touches. That is the standard
this document is asking to be held to.

A proof of concept follows the council, not this document.
