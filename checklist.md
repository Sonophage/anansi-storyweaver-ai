# Walk it yourself — round two, 2026-08-24

Everything you ticked last time is gone from this file. What is below is what came out of your
walkthrough notes, plus the two things you have not seen yet. Fifteen minutes.

**Restart the server before you start** — it is running code from before this batch:

```bash
node --experimental-strip-types serve.ts     # http://127.0.0.1:5174
```

You are on **Sutera Remembers**, chapter 2, 358 passages. That size is why some of this changed.

---

## 1 · One chapter at a time

The document showed the whole book in one scroll. At 358 passages there was no way to jump to a
chapter and the browser held all of it.

- [ ] The document shows **only the chapter you are on**, with `chapter N of M` in the header.
- [ ] A **pager** at the bottom moves to the chapter before or after.
- [ ] The **rail's chapter list** still jumps straight to any of them.

- [ ] **Careful with this one, and tell me if it is wrong.** Focusing an earlier chapter makes it
      the *current* chapter, so **the composer writes there**, not at the end of the book. That is
      existing deliberate behaviour — it is how you revise chapter 3 with chapter 3's context — but
      paging makes it much easier to land in chapter 1 by accident. Go to an early chapter, write
      one line, and see whether that is what you want to happen.

---

## 2 · Something is happening

- [ ] Press **Continue**. A **bar animates above the composer** for the whole call.
- [ ] The colour differs per action — Continue, Speak, Act, Direct, Narrate, and re-roll each have
      their own.
- [ ] **End this chapter** shows it too. That is two model calls and the longest wait in the app.
- [ ] **Continue looks like a button now**, not a fifth underlined mode. It acts; it does not select.

---

## 3 · History updates while you are looking at it

This was your *"takes doesnt update, edits did update"*.

- [ ] Open a passage's **⋯ → History** and **leave it open**.
- [ ] Press **Regenerate** on the bar. The **Takes** list grows **without you reopening the panel**.
- [ ] Edit that passage in the document. **Edits** grows too, in place.

> Both halves came from one fault: the panel kept its own copy, fetched when you opened it. Edits
> *looked* fine because you reopen the panel to look at an edit — and reopening refetches. You do
> not reopen it to regenerate.

---

## 4 · Search stays in this story

- [ ] **Search** inside a story. Results are **from this story only** now.
- [ ] The box says *"Search Sutera Remembers"*, not "Search your prose".
- [ ] **"Look in my other stories too"** widens it, and the placeholder changes to say so.
- [ ] **Worlds & lorebooks** search is still global — that is where the cross-story question belongs.

> This is also how *"add to the lore book"* could put an entry in a different story's ledger.

---

## 5 · The next-chapter setup page

Get here with **Chapter → End this chapter**, or `#<story-id>/setup`.

- [ ] **One list**, everything toggles — including entries that are **always on**. Each row says why
      it is in: *always on · pinned in · on its keywords · held back*.
- [ ] **Untick an always-on character.** It is **held back for this chapter only**. Check the
      **Context** panel: that entry is gone from the prompt.
- [ ] Tick it again and it comes back.
- [ ] **The filter box** finds someone or something in this story's ledger, and does not eat your
      keystrokes.

> Holding an always-on entry back has always worked in the engine — `force_out` is applied before
> the always-on branch. Nothing ever offered it, and the page said "no ticking needed".

---

## 6 · Compact now

- [ ] Open **Context**. Under the meter there is **Compact now**, with how much of the budget is
      prose.
- [ ] It summarises the open chapter, so its prose stops being sent line by line.

> Summarising already existed, on the Chapter panel — which is not where you are when you watch the
> meter fill up.

---

## 7 · Seeing the prompts

You asked to see what each mode sends, *"not in the ui but somewhere"*.

```bash
node --experimental-strip-types bench/prompts.ts                     # against the test fixture
node --experimental-strip-types bench/prompts.ts <story-id>          # against one of yours
node --experimental-strip-types bench/prompts.ts <story-id> --full   # the whole prompt too
```

- [ ] Run it. All five instruction blocks, plus the token cost of each against a real story.

> It calls `buildContext`, so it cannot drift from what is actually sent. `docs/PROMPTS.md` §5
> describes the same five in prose; when they disagree, the script is the one that is true.

---

## New since you left — worth a look when you walk it

- [ ] **Preferences → What you have written.** Words, passages split between you and Anansi,
      takes not chosen, calls to the model, and thirty days of writing as a sparkline. All off
      rows that already existed.

- [ ] **Preferences says which models are allowed.** Narrow the list with
      `ANANSI_MODELS="write-nt-qwen36-h,rp-nt-ornith-h"` when you start the server — ids or
      `prefix*`. Unset means everything the router serves.

- [ ] **+ Lore** on the composer bar, where New scene was. Pick a kind and write a card yourself,
      or **scan this chapter for facts** — the ritual's extraction step on its own, without ending
      the chapter.

- [ ] **Regenerate marks the take you left.** History shows it as *passed over* and dims it. It is
      not fed to the model — that is a prompt change, and F20 is what those cost to justify.

---

## Two measurements ran while you were out

Both are written up in `docs/findings/P0-FINDINGS.md`. The short versions:

**F21 — interiority.** A character's inner state written into canon comes back as the narrator
stating it **47.5%** of the time. And it changes nothing about how much interiority the narration
carries: the model already narrates the protagonist's inner state in **82.5%** of generations with
nothing in canon at all. That second number is the bigger finding, and nothing has ever aimed at
it. It also settles *threads between characters* by implication — same shape, so I stopped before
building it.

**F22 — two models resident.** I told you two 35B-class models would be tight at 96 GiB. **That was
wrong.** Your writer is a 35B-**A3B** and takes 25.9 GiB at full context; the largest preset is
36.5 GiB. Any two fit with room; three fit in several combinations. Per-story models are not
VRAM-blocked — the blocker is one module-level global in `src/llama.ts`.

---

## Six decisions are waiting for you

`docs/plans/DECISIONS.md` — options, my recommendation, and why, for each of:

1. Interiority's shape, now that it is measured (and threads with it)
2. Whether you want the 82.5% told-not-shown rate lower
3. Per-account prompt overrides — where they live, how they compose, what a bad one does
4. Character by prompt, and what "reroll" re-rolls
5. The composer writing into the chapter you are reading
6. The verbiage pass — threads / story / weaving

A line each is enough, and "none of these" is a real answer.

---

## Still open

### Editing the prompts per account — needs a decision from you

> i or the user should be able to change the base on it per account. if thats at all possible.

Possible, and I did not build it, because it is three decisions rather than a patch: where an
override is stored, how it composes with the five defaults (replace, or prepend), and what happens
when an override is bad — a mode whose block no longer says "write prose" produces nothing, and
that failure would look like a broken model rather than a broken setting. Worth twenty minutes of
talking before any code.

### Start blank needs a screen

> if were starting blank then the user needs a screen to fill in all these things themselves.

Spark works. **Start blank** still just creates `Untitled` and drops you in the editor.

### Preferences: your name, and a writing dashboard

Neither exists. The name is a hard-coded owner in `serve.ts`, with a `ponytail:` marker saying so.
Every number a dashboard would want is already in the database.

### Characters — the design conversation (PLAN-04 §3 onward)

Four things, none built: **character by prompt with a reroller**; **outfits** (designed with you as
a named table, one worn at a time); **interiority**, deliberately behind a measurement first — does
a character's inner state leak into the narration; and **threads between characters**, agreed as a
text field rather than a new table.

### New scene → New lore

New scene is gone from the composer. Nothing replaced it. What you described is a button that
either reads the chapter for facts — which the ritual already does — or opens a new entry of a
chosen type.

### Regenerate marking the take you rejected

The canon half is done: each take records what its own prompt carried. Nothing marks a take as
rejected, so nothing can steer the next one away from it.

### Per-story model, and the admin allowlist

Answered, not built. Every request already names its model, and your router runs a **separate
process per preset** — so `MODEL` being one module-level global in `src/llama.ts` is the only
reason switching is process-wide. Per-story model is a small code change; the real question is
VRAM, and at 96 GiB two 35B-class models wants measuring rather than guessing.

---

## Not built on purpose

- **Homepage / login.** One hard-coded owner, no auth.
- **A model selector inside a story.** In Preferences, because the model is process-wide. It moves
  the day per-story models land.

## Your ideas, recorded

- **Talk to Anansi about the story** — ask for a character or a piece of lore in conversation and
  have it written into the ledger.
- **Search the web for lore** when the story is set in an existing IP.
- **Smoother animations, and cohesive verbiage** around *threads, story, weaving*. Worth one
  deliberate pass rather than piecemeal: the app currently says canon, ledger, entries, cast and
  threads for overlapping things, and that inconsistency is mine.

---

## If you want to run the tests

```bash
node --experimental-strip-types test/all.ts    # 110 checks, six suites, no model needed
test/ui/run.sh                                 # 10 scenarios in a headless browser, no model
test/ui/run.sh "model ritual"                  # the two that wait on real generations
```
