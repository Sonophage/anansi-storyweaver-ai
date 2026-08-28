# Talk to Anansi — scope, 2026-08-24

> talk to anansi, about the story, or a character or something about the story to be added and
> then anansi does it. or to search the web for new lore or something if its an ip

Nothing is built. This is the scope, not a plan to execute — the decisions at the end are yours.

**Corrected by Seth, same day:** it *should* write — but what it writes is **threads**, and it
should also **draft a prompt in its own window for you to take to the composer.** That is a better
shape than the read-only/writes split this doc opened with, and a cheaper one, so the split is gone.

The whole feature is one idea: **the chat window produces things you then choose to use.** It never
puts a word into your prose itself. That is the rule the rest of the app already runs on —
extraction proposes and waits, regenerate keeps every take, an import previews before it writes.

| | what it produces | how it lands | new machinery |
|---|---|---|---|
| **the chat** | answers, threads, and drafted directives | you accept or use each one | one role, one block set, a panel |
| **Fetch** | lore off the web for an existing IP | proposals with a citation | network egress, a service, a trust model |

---

## 1 · What one turn can produce

Three kinds of thing, any or none of them, out of a single structured call:

| | what it is | where it goes | how it lands |
|---|---|---|---|
| **an answer** | plain text — *"Marek is owed eleven crowns and has not been paid"* | the chat window | nowhere; it is just the reply |
| **a thread** | a proposed entry, the shape `extract` already produces | the proposals queue | you **accept** it, as today |
| **a directive** | a drafted prompt — *"Marek's man makes it clear the debt is due tonight…"* | **the composer, in Direct mode** | you **use** it, then edit or send |

`structured()` already returns several things at once — `EXTRACT_SCHEMA` is the precedent — and
`maxLength` on a string is honoured by the GBNF converter, measured in this project on 2026-08-23.
So this is one role and one schema:

```
{ reply: string,
  directive?: string,        // bounded — a prompt, not a paragraph
  entries?: [ …the EXTRACT_SCHEMA shape… ] }
```

**The directive is handed over, not fired.** It lands in the composer input with the mode switched
to Direct — editable, unsent. You read it, change what is wrong, and press send yourself: the
handoff you described as copying, without the copying. A copy button as well, for when you want it
somewhere else.

That single decision is what keeps the feature safe. **A conversation that could send is a
conversation that can write your book while you are thinking out loud.**

---

## 2 · Threads — nearly free, because you already built it

`classify()` resolves a proposal against existing entries on the **title only**, with containment
and a shared distinctive word — it already knows "Marek Vale" and "Marek" are one person, and that
a keyword naming someone else is not evidence of being them. `proposals_dedupe`, a unique index on
`(story_id, content_hash) WHERE status='open'`, already stops the same suggestion arriving twice.
The queue, the accept and reject, and *nothing is canon until you accept it* are built and tested.

A thread out of the chat window is the **same pipeline as extraction**, entered from a sentence
instead of from a chapter.

**The risk, named:** F21 measured canon coming back out of the model at 47.5%. A conversation that
reads the ledger in order to avoid duplicates may well propose things already in it, reworded.
`classify` and the dedupe index both catch that — but how often it happens is worth measuring
before trusting the queue not to fill with near-misses.

---

## 3 · The conversation itself

### What it reads

Not what the composer reads. A prose prompt is **28,100 tokens** on Sutera, most of it the recent
prose tail — and a question about who Marek is does not need the last forty passages.
`buildContext` already selects blocks by mode, so this is a **new mode with a different block
set**: SPINE + CANON + EARLIER, little or no TAIL. Cheap, leaves room for the conversation, and
reuses the budget engine rather than working around it.

### Thinking should probably be ON — and could not have been before today

`chat_template_kwargs: { enable_thinking: false }` is **mandatory for prose**: F5 measured the model
spending its entire budget reasoning and returning *zero prose* on three runs of four.

But that finding is about **prose**. Drafting a directive, or deciding whether something
contradicts chapter three, is exactly the work thinking is for. And as of today a story names its
own model — so the chat could run on `agentic-t-tcap27-h`, a thinking model already on the box,
while prose stays on `write-nt-qwen36-h`. The router holds three at once.

That combination did not exist this morning, and it is the strongest argument for building this now.

### Turns accumulate

Each exchange is context for the next. Needs a cap, and a visible one, or the fifth question costs
twice the first. Keep the last N turns, show the count, say what was dropped — the discipline the
overflow guard already uses.

### Where it lives, and what it is not

**Not a composer mode.** The five modes write the book. This one drafts what you might tell them,
and putting it on the same bar as Continue and Speak invites exactly the mistake it is designed to
prevent. Its own panel — a seventh — or inside Context, which is already the "what does Anansi
know" room.

### Does it persist?

Ephemeral to start: no schema, no export question, nothing for the round-trip invariant to cover.
If you find yourself wanting yesterday's answer, that is the evidence for a table, and it is a small
migration when it comes.

---

## 4 · Fetch — the one I would not build yet

*"search the web for new lore or something if its an ip"*

This is a different kind of change from the rest of it.

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

It is one feature now, so it is one build:

1. **The chat panel**, its own block set, thinking on, on a model of its own — with the three
   outputs from one structured call, and the directive handed to the composer unsent.
2. **Measure two things** rather than assume them: whether thinking actually helps here, and how
   often a thread it proposes is already in the ledger. F20 is the standing warning — a plausible
   prompt change cost 850 runs per arm to prove it did nothing.
3. **Fetch**, only if you still want it after using the rest, and only as a proposal with a citation.

## What I need from you

- **Where does it live** — a seventh panel, or inside Context?
- **Should the directive land in the composer, or only offer a copy button?** I would hand it over
  in Direct mode, unsent and editable. Copying works too and is one line less.
- **Ephemeral or saved?** I would start ephemeral.
- **Is Fetch in or out?** It is the only one that changes what this app is.
- **What is it called?** *Talk to Anansi* is your phrase and it is good. If the verbiage pass lands
  first this may want to be the same word as everything else — the weaver, the loom, asking the
  spider. Your call, and it is decision 6 in `DECISIONS.md`.
