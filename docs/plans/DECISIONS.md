# Six decisions waiting on you — 2026-08-24

Each one has options, what I would pick, and why. Answer in whatever form suits — a line each is
enough, and "none of these" is a real answer. Nothing here is built.

Ordered by what unblocks the most.

---

## 1 · Interiority, now that F21 has measured it

**The measurement.** A character's inner state written into canon comes back as the narrator
asserting it **47.5%** of the time [39–56]. And it makes no difference to how much interiority the
narration carries: the model already narrates the protagonist's inner state in **82.5%** of
generations with nothing in canon at all.

**A** — **Don't build it.** Canon is for facts the prose must not contradict. Inner state is not
that, and the model is already producing plenty of interiority unprompted.

**B** — **Its own block, with an instruction.** A `MIND` block, separate from `CANON`, saying
roughly: *this is what he feels and does not say; let it shape what he does, never state it.*
Measurable: rerun F21's arms with the block instead of the canon line and see if 47.5% moves.

**C** — **Build it as canon anyway** and accept that it gets restated.

**I would pick B, and measure before shipping it.** The reason is F20: a plausible prompt change
did nothing at all, and cost 850 runs per arm to prove. B is the same shape of hope. If the block
does not move 47.5%, the answer becomes A and we will have spent one afternoon finding out.

**The related one:** *threads between characters* was agreed as a text field on the entry. That is
the same shape as an interiority line — *"he had loved her once"* would land in your prose as
narrator-stated backstory. I stopped before building it. Same three options apply.

---

## 2 · The 82.5%, which is the bigger prize

Not a feature — a property of the prose you are getting. More than four generations in five have
the narrator stating the protagonist's interior: *he felt, he knew, he was certain*.

Nothing has ever aimed at that. It may be what you want in this register, or it may be the single
biggest quality lever in the app.

**Do you want it lower?** If yes, the next measurement is whether an instruction against telling
moves it — one line in `SYSTEM` or in the style field, A/B'd the way F20 and F21 were. If you like
it where it is, say so and I will stop looking at it.

---

## 3 · Per-account prompt overrides

You asked to see the prompts and change the base per account. Seeing them is done —
`bench/prompts.ts`. Changing them is three decisions:

**Where it lives.** Per story (a column, travels with an export) or per writer (a settings row,
applies to everything you write). I would say **per story** — register and voice are already
per-story, and an export that loses its prompts is a worse export.

**How it composes.** Replace the default block outright, or prepend to it. **Replace** is simpler
to reason about and easier to undo; prepending means every mode carries two instructions that can
disagree.

**What happens when one is bad.** This is the one that matters. A `narrate` block that no longer
says "write prose" produces nothing, and that failure looks exactly like a broken model. I would
want: the default shown beside the override, a one-press revert, and the Context panel's *Prompt
sent* view as the place you check your work.

**My recommendation: per story, replace, with the default always visible next to it.**

---

## 4 · Character by prompt, and the reroller

Same shape as Spark, aimed at one character. Two open questions:

**What it fills.** Name, body, type, trigger words — or also the things not built yet (outfits,
threads)? I would start with **what an entry already has**, so it is useful the day it lands.

**What "reroll" re-rolls.** The whole character, or one field at a time keeping the rest? One
field at a time is more work and much more useful — the usual case is a good character with a
wrong name.

**My recommendation: fill what an entry already has, reroll per field.**

---

## 5 · The composer writes into the chapter you are reading

Paging made this sharp. Focusing an earlier chapter makes it the *current* chapter, so the
composer appends **there**. That is deliberate — it is how you revise chapter 3 with chapter 3's
context — but it is now one click away in a 358-passage story.

**A** — leave it. It is correct and you will learn it.
**B** — leave it, but say so: the composer shows *"writing into chapter 2"* when you are not at the
end.
**C** — reading an old chapter is read-only; writing snaps you back to the last chapter.

**I would pick B.** C removes something real, A leaves a trap.

---

## 6 · The verbiage pass

Your note: the wording should be cohesive around *threads, story, weaving*. It is not, and that is
mine. Right now the app says, for overlapping things:

| word | where | means |
|---|---|---|
| canon | engine, docs | facts the prose must not contradict |
| ledger | UI, docs | the store of those facts |
| entries | UI, db | the rows in it |
| cast | old UI | the characters among them |
| threads | new UI | *all* the rows, in a story |
| lore | entry type, Worlds page | a kind of row, and also all of them |

**Threads** already does the work of *ledger*, *entries* and *cast*. My instinct is: **threads** is
what a story's cards are, a **thread** is one of them, **canon** stays as the engine's word for what
reaches the prompt, and **lore/ledger** retire. But this is your voice, not mine — tell me the
words and I will make one pass over the whole surface.

---

## Not decisions, just waiting

- **Start blank needs a screen.** Clear; I can build it whenever.
- **Preferences: changing your name.** The dashboard landed. The name is a hard-coded owner in
  `serve.ts` — changing it is easy, but it is the first thread of "is there more than one of you",
  which is the login question you have deliberately left alone.
- **Outfits.** You already chose: named, one worn at a time, a table with a partial unique index.
  Buildable without further input.
- **Talk to Anansi about the story** — now scoped, in `docs/plans/PLAN-05-TALK.md`. The short
  version: that one sentence is three features. **Tell** (you say what to add, it proposes) is one
  prompt role away, because `extract` already classifies, dedupes and files proposals. **Ask** (a
  conversation) is the genuinely new one, and is newly worth building because per-story models
  landed today — it could run thinking-on on a thinking model while prose stays thinking-off,
  which F5 requires. **Fetch** (web search for an IP) is the only one that changes what this app
  is: it would be the first outbound request it has ever made.
