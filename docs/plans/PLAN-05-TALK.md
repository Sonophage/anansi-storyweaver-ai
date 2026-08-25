# Talk to Anansi — scope, 2026-08-24

> talk to anansi, about the story, or a character or something about the story to be added and
> then anansi does it. or to search the web for new lore or something if its an ip

Nothing is built. This is the scope, not a plan to execute — the decisions at the end are yours.

**That sentence is three features.** They share a name and almost nothing else: different costs,
different risks, and one of them is nearly free because the machinery already exists.

| | what it does | writes? | new machinery |
|---|---|---|---|
| **Ask** | answers questions about the story | no | a conversation, a block set, a budget |
| **Tell** | you say what to add, it proposes entries | via proposals | one prompt role |
| **Fetch** | pulls lore off the web for an existing IP | via proposals | network egress, a service, a trust model |

---

## 1 · Tell — the cheap one, and the one you described most concretely

*"something about the story to be added and then anansi does it"*

**This is `POST /api/extract` with your sentence as the input instead of the chapter's prose.**

Everything else already exists and is already right:

- `classify()` resolves a proposal against existing entries on the **title only**, with containment
  and a shared distinctive word — it already knows that "Marek Vale" and "Marek" are the same
  person and that a keyword naming someone else is not evidence.
- `proposals_dedupe`, a unique index on `(story_id, content_hash) WHERE status='open'`, already
  stops the same suggestion arriving twice.
- The proposals queue, the accept/reject buttons, and **nothing is canon until you accept it** are
  all built and tested.

So Tell is: a new prompt role that takes a sentence instead of a chapter, and the same pipeline
after it. The `EXTRACT` role even has the right instincts already — *"propose only facts that are
now permanently true"*, *"propose nothing rather than pad"*.

**What is genuinely new:** almost nothing. Which is why I would build this first.

**The risk, named:** F21 measured the model restating canon it was given, at 47.5%. A Tell that
reads the ledger to avoid duplicates could propose things already in it, reworded. `classify` and
the dedupe index both catch that — but the *measurement* of how often it happens would be worth
having before trusting the queue not to fill with near-duplicates.

---

## 2 · Ask — the genuinely new one

*"talk to anansi about the story, or a character"*

Questions with answers. "Who is Marek?" "What have I set up and not paid off?" "Does this
contradict chapter three?" Read-only.

Four things have to be decided, and three of them are interesting.

### What does it read?

Not what the composer reads. A prompt for prose is **28,100 tokens** on Sutera, most of it the
recent prose tail — and a question about who Marek is does not need the last forty passages.

`buildContext` already selects blocks by mode, so this is a **new mode with a different block
set**: SPINE + CANON + EARLIER (the chapter summaries), and little or no TAIL. That is cheap,
leaves room for the conversation itself, and reuses the budget engine rather than working around it.

### Thinking should probably be ON — and could not have been before today

`chat_template_kwargs: { enable_thinking: false }` is **mandatory for prose**. F5 measured it: with
thinking on, the model spent the entire 900-token budget reasoning and returned *zero prose* on
three runs of four.

But that finding is about **prose**. Answering "does this contradict chapter three" is exactly the
work thinking is for. And as of today a story can name its own model, so Ask could run on
`agentic-t-tcap27-h` — a thinking model already on the box — while the prose stays on
`write-nt-qwen36-h`. The router holds three at once.

That combination did not exist this morning. It is the strongest argument for building Ask at all.

### It must not be a composer mode

The five modes write the book. A conversation must never put a word into your prose, and putting
it on the same bar as Continue and Speak is asking for exactly that mistake at 2am. It is its own
panel — a seventh — or it lives inside Context, which is already the "what does Anansi know" room.

### Turns accumulate

Each exchange is context for the next. Needs a cap and a visible one, or the fifth question costs
twice the first. Simplest honest answer: keep the last N turns, show the count, and let the panel
say what it dropped — the same discipline the overflow guard already uses.

### Does the conversation persist?

- **Ephemeral** — gone when you close the panel. No schema, no export question, nothing to leak.
- **Per story** — a `conversations` table, travels with an export, and answers "what did I ask
  about this book". Also one more thing the round-trip invariant has to cover.

I would start **ephemeral**. If you find yourself wanting yesterday's answer, that is evidence for
the table, and it is a small migration when it comes.

---

## 3 · Fetch — the one I would not build yet

*"search the web for new lore or something if its an ip"*

This is a different kind of change from the other two.

- **The app has never made an outbound request.** `serve.ts` binds to loopback and the only thing
  it talks to is llama-server on 127.0.0.1. Fetching means real network egress, from a
  local-first app, on a machine where "local-first, no cloud" has been the point.
- **Which service?** A search API means a key and a third party seeing your queries. A local
  SearXNG avoids the key and not much else. Neither is free.
- **What comes back is untrusted text**, and `src/import.ts` already knows what that costs: a
  character card's `system_prompt` is kept as a note and never reaches the model, because it is a
  directive written by a stranger. A web page is worse. Anything Fetch returns would have to go
  through the same discipline — proposals only, never straight into a prompt.
- **The IP case is the one where being wrong is loudest.** Canon for an existing world is exactly
  where a plausible invention is hardest to spot and most annoying to find later.

If you want it, the shape that survives all of that is: **Fetch is Tell with a citation.** It
proposes entries, each carrying the URL it came from, and nothing reaches the model until you
accept it. Same queue, same rule.

---

## What I would do

1. **Tell**, because it is one prompt role away and reuses a pipeline you already trust.
2. **Ask**, as its own panel, its own block set, thinking on, on a model of its own — measuring
   whether thinking actually helps before assuming it, the way F21 and F20 were measured.
3. **Fetch**, only if you still want it after using the first two, and only as Tell-with-a-citation.

## What I need from you

- **Tell first, or Ask first?** I have argued for Tell; you may want the conversation more.
- **Where does Ask live** — a seventh panel, or inside Context?
- **Ephemeral or saved?** I would start ephemeral.
- **Is Fetch in or out?** It is the only one that changes what this app is.
- **What is it called?** *Talk to Anansi* is your phrase and it is good. If the verbiage pass lands
  first this may want to be the same word as everything else — the weaver, the loom, asking the
  spider. Your call, and it is decision 6 in `DECISIONS.md`.
