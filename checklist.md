# Walk it yourself — round four, 2026-08-25

Round three is gone from this file: everything on it is built, and everything you wrote in
`bugs.md` against it has been done or has a finding saying why not. What is below is the new work —
your answers built, plus COUNCIL-04's list worked through to one remaining item — and what is still
open underneath it.

Ten sections. The one I most want your eye on is **§1**: passages are shorter twice over now and
that is a taste question no benchmark answers.

**Restart the server first.** Every round three bug report started with a server older than HEAD.

```bash
node --experimental-strip-types serve.ts     # http://127.0.0.1:5174
```

You are on **Sutera Remembers**, chapter 2.

Twenty minutes. Bugs go in `bugs.md`, under the matching heading.

---

## 1 · The look — v2 of the design

The whole of `Anansi App v2.dc.html`, applied to the app as it stands rather than as the canvas
imagines it: the canvas has no Strings and still calls Context the inspector, and its own note is
entirely about feel.

- [ ] **Nine themes**, not three. Aa → and Parchment now turns the **rail and the panel** to paper,
      not only the document. Cyberpunk, Fantasy, Grimdark, Novelist, Sci-fi and Romance are new.
- [ ] **Every mark is a fragment of the orb-web** at one hairline weight — a ring, a half-ring,
      three spokes. They replace ⚙ ❧ ☙ ⟡ ◈ ⌕ ◐ ✻ ❋ ✎ ↧ ☰, which came from six Unicode blocks.
- [ ] **A chapter opens with a band**: its number, its name at 48px, and an **epigraph pulled from
      its own prose**, then a rule and a drop cap.
- [ ] The **running head** opens above the prose once the band has scrolled away, carrying the
      chapter and the count — so the header carries the book, and the model when the rail is not
      showing it. It must never sit ON the prose: the first version was sticky inside the column and
      rode over the middle of a paragraph as a black band.
- [ ] **Aa → Theme.** Nine discs, each half paper and half that theme's accent. The first version
      cut them on a 135° diagonal at 52% and they read as folded squares in six shades of black.
- [ ] **Parchment and Novelist take grain.** The dark themes are screens and do not.
- [ ] Labels are **small caps, sentence case**; one radius family (3px, 12px, pill); one motion
      curve.
- [ ] On a phone, the panel **rises from the bottom edge** it lives on.

> The epigraph is mine to defend: it is never taken from the first passage, because quoting a line
> you are about to read four inches later is a stutter rather than an epigraph, and never from
> dialogue, because hoisting a character's words to the head of a chapter puts the narrator's
> authority behind something somebody merely said. A chapter with one passage gets none.

## 2 · The composer, and the passage arriving

**Passages are shorter twice over.** `max_tokens` went 900 → 450, and F29 took the paragraph count
out of Continue's prompt, which halved it again — median 685 characters to 291 on the bench
fixture. That is the model stopping when the beat is done rather than padding to a number, and the
samples read as complete beats. But it is a big change to how the book comes out, and whether you
want it is a taste question no benchmark answers. **This is the thing I most want your eye on.**

The animation is the third version. Say if it is still clunky.

- [ ] Press **Continue**. A block appears **immediately** at the end of the chapter, saying
      **WRITING** with a run of glyphs breathing beside it. That is the wait, not a hang.
- [ ] The prose then fills in **behind** the glyphs, which stay at the writing edge as one block.
- [ ] Nothing you have already read ever changes. The old version rescrambled the last sixteen
      characters on every token, which is what made it feel like it was chewing.
- [ ] The composer **stays where it is** for the whole call. It used to slide off the right edge
      for the length of every generation — that was layout, not animation.
- [ ] Type half a sentence and **do not send it**. Open a panel, change mode, turn to another
      chapter. The line is still there, **with the cursor where you left it**.
- [ ] Now open a **different story**. The line is gone — a draft belongs to its book, and carrying
      it across would be worse than losing it.

> **Passages are half as long now.** `max_tokens` went 900 → 450, so a passage arrives in half the
> time and the prompt gets those tokens back. If that is too short for you, Storyteller → Max
> tokens, and tell me what number you land on.

---

## 3 · Anansi has a voice, and a panel

- [ ] Open **Anansi** on a story you have not asked anything yet. It offers **four openings** —
      what the story has set up and not paid off, who somebody is, what it has never said outright,
      and set up the next scene. One of them names somebody from **your** cast.
- [ ] Tap one. It **fills the box and does not send**. Nothing in that panel happens until you
      choose it, and a suggestion that sent itself would be the first thing to break that.

> It used to be two paragraphs of explanation over a panel-height void, with a three-line footnote
> about web search underneath. The footnote is one line now, and only when search is off.

Rail → **✻ Anansi**, inside a story.

- [ ] Ask it **what the story is about**. It answers at length — it used to stop dead at 1,400
      characters, mid-word, and the answer looked finished. F25.
- [ ] Ask it something short. It answers short, **and still says what it drew on**.
- [ ] Ask it something the story does not say. "It does not say" is a whole answer.
- [ ] Ask it to **set up a scene**. The directive goes in the card, not into the reply.
- [ ] Ask it who someone is. **No directive card, no proposals.** A question is not a work order.

> Two things F26 measured and did NOT fix: instructions still leak into the reply sometimes, and an
> unasked proposal still happens — two runs of the same question gave four and then none. Tell me
> if either is annoying enough to gate in code.

---

## 4 · Have Anansi write one

**Threads → a character → Wardrobe**, and **+ Thread** on the composer bar.

- [ ] Wardrobe: **Have Anansi dress her**, with or without a line of direction. It fills the two
      fields and **does not save** — Add an outfit is still your press.
- [ ] + Thread: pick a kind, write a line or leave it empty, **have Anansi write one**. It goes to
      the proposals queue under Chapter. Nothing reaches the ledger.
- [ ] Try one it already has. It should come back **duplicate**, not propose it twice.
- [ ] **Search the web** is beside both, and off unless `ANANSI_SEARCH` is set.

> Small, known: the trigger words sometimes include the title again, which the prompt says not to.

---

## 5 · The character the model does not write

**Story → The model never writes.**

- [ ] Name yourself there. Generate a few passages.
- [ ] It should write **the room's answer** — what others say and do, what happens to you — and
      stop where you would act.
- [ ] Set it back to **Nobody** and generate again. The difference should be obvious.

> Measured, F28, 25 generations an arm run simultaneously: dialogue for him **20% → 0%**, action
> **76% → 25%**, and his interiority **24% → 17%, which is nothing at all**. Two of your three.
> The model narrates his inner state because that is what third-limited prose IS, and one line in
> the prompt does not move it. If you want that moved it needs its own attempt.

---

## 6 · Contradictions are the model's problem now

- [ ] Write something that contradicts a thread — say a character's eyes are the wrong colour in
      canon, then generate into a scene about it.
- [ ] The **flag should be rarer**: the model is now told what it broke and given one go at fixing
      it before the passage is delivered.
- [ ] When a flag does appear, it is one the model could not fix.

> Measured now, F30: **1.5 seconds on every generation**, flat, and it did not fire a repair once
> in six. That is about a third of a warm passage. Whether a contradiction caught before it reaches
> the page is worth it is your call — the switch does not exist yet, so say if you want one.

---

## 7 · The Context panel, and the horizon

- [ ] Rows are named for **where they go**: Premise & setting, Voice of the weave, Threads always
      on, Point of view & register, Where you left off, The mode you picked.
- [ ] Click one. You land on the panel that uses that word.
- [ ] The dropped rows **collapse to one row per reason**, with a count and what it cost. Ninety-six
      identical lines became one.
- [ ] On a long story, the **header itself** says `N chapters not sent` beside the percentage. You
      should not have to open a panel to learn that part of your book has stopped reaching the
      model. Press it — the panel names the range and points at Acts.
- [ ] Break something so a manifest cannot be built (a context cap of 600 will do it). The panel
      says **it could not be assembled**. It used to keep showing the last one that worked, which
      on a story you had just left meant the previous book's prompt under this book's title.

---

## 8 · Acts, for a long book

**Chapter → Acts**, inside a story.

- [ ] With two or more summarised chapters, the button names the range it will take.
- [ ] Roll them up. Their own summaries stop being sent and the act stands in for them.
- [ ] **Context** should show fewer EARLIER rows and fewer tokens against them.
- [ ] Remove the act. Those chapters send their own summaries again.

- [ ] **Context → Blocks**, on a long story. The dropped rows say `EARLIER 25% ceiling` with a
      count. What survives should now be a **run of recent chapters**, not a scatter.

> F31 and F32. What gets dropped when you have not rolled up used to be chapters 6-9, 52-55 and
> 96-99 — the ids were sorted as **strings**, so `c10` came before `c2`. It is the distant past now,
> in one piece. What is still true: at chapter 120 fifty-two summaries are dropped and **the only
> place that admits it is that panel**. If you have not opened it, you do not know your book has a
> horizon.

## 9 · The prompts, in your words

**Storyteller → The five modes, in your words.**

- [ ] Open **Speak**. The box holds the wording that ships, not an empty field.
- [ ] Rewrite it and **Save**. Open **Context → Prompt sent** and read it there — what you typed is
      what the model gets, with `{{speaker}}` filled and nothing added.
- [ ] Press **Default**. The shipped wording comes back.
- [ ] It is **global to you**, not to this story. Check it in another story.

> Not built, and it is DECISIONS §3: an override REPLACES, it does not merge with the shipped
> wording, and nothing validates it beyond refusing a blank. A prompt that produces nothing
> produces nothing, and the way back is one press.

## 10 · Taking a book out and putting it back, and switching fast

- [ ] **Story → Take it with you → As a standalone database.** Do it on a story that has a
      **written register**, a **raised context cap**, a **named model** and a **locked character**.
- [ ] **Import** that file. All four should still be set. They used to vanish silently: the export
      list was written by hand and those four were not on it.
- [ ] Try importing something **over 20MB**. It is refused, and nothing of it reaches the disk. The
      `.db` path used to write first and ask afterwards.
- [ ] Open a story, then **immediately open another** before the first finishes loading. The book
      on screen and the **Context panel** must agree. A slow answer for the book you left used to
      land on the book you opened.

## 11 · Strings — what the story owes

Rail → **⟡ Strings**, inside a story.

- [ ] **Tie one**: the letter he has not opened, from chapter 6, owed by 20. It appears with how
      long it has been sitting, and turns **red** when it is past the chapter it was owed by.
- [ ] It is **yours only** at first. Check **Context → Prompt sent** — the model is not told.
- [ ] **Put it in play.** Now it is in the prompt, under `<unpaid>`, told what is owed and told not
      to resolve it unless you ask. Put it away again and it leaves.
- [ ] Mark one **Paid off**. It leaves the prompt whatever its in-play state was — a paid promise
      the model is still told about is an instruction to pay it twice.
- [ ] Export the story and import it back. The strings come with it, **out of play** — summoned
      means "in the scene I am writing now", which belongs to the session rather than the book.
- [ ] Ask **Anansi** what the story has set up and not paid off. What it offers goes to the
      proposals queue under Chapter, like everything else. Accepting one ties a **string**, not a
      thread.

> F33: asked on Sutera, it returned three real unpaid setups and one character entry, sorted
> correctly, first try. It said **chapter 1** for all three on a story open at chapter 2 — nothing
> it was given named the chapter the trailing passages belong to. One line now does, and the same
> question came back **2, 2, 2**. Check the numbers anyway; six strings over two runs is not a rate.

## 12 · Delete, and the model list

- [ ] ⋯ → **Delete** on a passage with more than one take. It says **Delete take 2**, asks once,
      and deletes on the second press.
- [ ] The other takes are **still there** afterwards. They used to stay in the database, invisible.
- [ ] **Preferences** and **Storyteller → Model** read as names now: *Write · Qwen3.6*, *no
      thinking · uncensored*. The raw id is one hover away.

> Two guesses in those names that are yours to confirm: I read `t`/`nt` as thinking and `-h` as
> uncensored.

---

## Still open

**COUNCIL-04 is closed** — all eight findings and all seven of its smaller items. Nothing from the
original review is outstanding. What is left is of three kinds.

### Waiting on you, not on me

- **This walk.** Twelve sections and `bugs.md` is empty. Everything below the line has been built
  and measured; none of it has been used by the person it is for.
- **§2, the passage length.** Shorter twice over — `max_tokens` 900 → 450, and F29 took the
  paragraph count out of Continue's prompt, which halved it again on the bench fixture. The samples
  read as complete beats, but whether that is the book you want is a taste question no benchmark
  answers.
- **The four decisions** in `docs/plans/DECISIONS.md`. §1 interiority's shape and §2 the 82.5% —
  F28 now says a standing instruction in the prompt does not touch interiority at all, so if you
  want that number moved it needs a different lever and which one is yours to pick. §3 prompt
  override composition, which is the one thing not built inside a finished item: an override
  replaces rather than merges and nothing validates it beyond refusing a blank. §4
  character-by-prompt and what reroll re-rolls — your answer in round three was a global lore
  reroll, or one entry, or one box, and none of it is built.

### Measured, known, not fixed

- **Anansi still leaks instructions into a reply** sometimes, and an unasked proposal is variable
  rather than gone — two runs of the same probe gave four and then none (F26). Neither is a
  candidate for more prompt; a code-side gate is a product decision.
- **Invented `keys` sometimes repeat the title**, which the prompt tells it not to (F27).
- **The contradiction repair costs 1.5s on every generation** and there is no switch to turn it off
  (F30).
- **Anansi's chapter numbers** are right now that it is told which chapter it is looking at, but
  that is one run against one story (F33).

### Deliberate debt — eleven `ponytail:` markers

Four are architecture and are not going anywhere soon: SQLite rather than Postgres (pgvector is
unscheduled), one hardcoded owner, no streaming backpressure, and ceilings-with-a-refusal instead
of a budget engine. The rest each name a ceiling: three stored-and-ignored entry columns, a LIKE
scan that goes linear at chapter 40, rejected takes recorded but not fed back, the repair's length
floor, prompt-override validation, the remaining key logic (secondary keys, exclusion keys, regex),
and the checker's blindness to numeric contradictions.

`grep -rn "ponytail:" src web bench *.ts *.html` is the ledger. Full COUNCIL-04 write-up with line
numbers: `docs/findings/COUNCIL-04.md`.

## Four decisions, and F28 moved two of them

`docs/plans/DECISIONS.md`.

1. **Interiority's shape** — my recommendation is still option A, build nothing.
2. **The 82.5%** — F28 now says a standing instruction in the prompt does not touch it. If you want
   that number down it needs a different lever, and which one is your call.
3. **Per-account prompt overrides** — where stored, how they compose, what a bad one does.
4. **Character by prompt**, and what "reroll" re-rolls. Your answer in round three was: a global
   lore entry reroll, or one entry, or one input box. Not built yet.

---

## Measured since round three

`docs/findings/P0-FINDINGS.md`.

- **F25** — Anansi's cut-off answers were the grammar, not the token budget. Exactly 1,400
  characters, mid-word, valid JSON. Two adjacent defects fell out of measuring it.
- **F26** — the voice. Two over-corrections caught only by re-probing. Two residuals not fixed.
- **F27** — the invent button took three passes, and pass one reproduced F25 the same day.
- **F28** — the lockout. Dialogue to zero, action cut by two thirds, interiority untouched.
- **F29** — the mode prompts. The checklist was being filled 10/10; taking the paragraph count out
  of Continue halved the passage.
- **F30** — the contradiction repair costs 1.5s on every generation, flat, and fired 0 times in 6.
- **F31** — chapter 120 does not fit, and Acts fix it: 4,083 tokens against 11,440.
- **F32** — the eviction order was alphabetical in one place and creation order in the other.

Read F28's last section if you read nothing else: **the detector was wrong twice**, and the second
time it survived a fixture built to fix the first, because the model re-genders characters against
canon. Every rate in it is a floor.

---

## Running the tests

```bash
node --experimental-strip-types test/all.ts    # 165 checks, nine suites, no model needed
test/ui/run.sh                                 # 10 scenarios, headless browser, no model
test/ui/run.sh "model ritual"                  # the two that wait on real generations
node --experimental-strip-types bench/lockout.ts check    # F28 detectors, no model
node --experimental-strip-types bench/modes.ts check      # F29 detector, no model
```
