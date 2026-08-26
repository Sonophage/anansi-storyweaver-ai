# Walk it yourself — round four, 2026-08-25

Round three is gone from this file: everything on it is built, and everything you wrote in
`bugs.md` against it has been done or has a finding saying why not. What is below is the new
work — the answers you gave me, built — plus what is still open underneath it.

**Restart the server first.** Every round three bug report started with a server older than HEAD.

```bash
node --experimental-strip-types serve.ts     # http://127.0.0.1:5174
```

You are on **Sutera Remembers**, chapter 2.

Twenty minutes. Bugs go in `bugs.md`, under the matching heading.

---

## 1 · The composer, and the passage arriving

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

> **Passages are half as long now.** `max_tokens` went 900 → 450, so a passage arrives in half the
> time and the prompt gets those tokens back. If that is too short for you, Storyteller → Max
> tokens, and tell me what number you land on.

---

## 2 · Anansi has a voice

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

## 3 · Have Anansi write one

**Threads → a character → Wardrobe**, and **+ Thread** on the composer bar.

- [ ] Wardrobe: **Have Anansi dress her**, with or without a line of direction. It fills the two
      fields and **does not save** — Add an outfit is still your press.
- [ ] + Thread: pick a kind, write a line or leave it empty, **have Anansi write one**. It goes to
      the proposals queue under Chapter. Nothing reaches the ledger.
- [ ] Try one it already has. It should come back **duplicate**, not propose it twice.
- [ ] **Search the web** is beside both, and off unless `ANANSI_SEARCH` is set.

> Small, known: the trigger words sometimes include the title again, which the prompt says not to.

---

## 4 · The character the model does not write

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

## 5 · Contradictions are the model's problem now

- [ ] Write something that contradicts a thread — say a character's eyes are the wrong colour in
      canon, then generate into a scene about it.
- [ ] The **flag should be rarer**: the model is now told what it broke and given one go at fixing
      it before the passage is delivered.
- [ ] When a flag does appear, it is one the model could not fix.

> Measured now, F30: **1.5 seconds on every generation**, flat, and it did not fire a repair once
> in six. That is about a third of a warm passage. Whether a contradiction caught before it reaches
> the page is worth it is your call — the switch does not exist yet, so say if you want one.

---

## 6 · The Context panel

- [ ] Rows are named for **where they go**: Premise & setting, Voice of the weave, Threads always
      on, Point of view & register, Where you left off, The mode you picked.
- [ ] Click one. You land on the panel that uses that word.
- [ ] The dropped rows **collapse to one row per reason**, with a count and what it cost. Ninety-six
      identical lines became one.

---

## 7 · Acts, for a long book

**Chapter → Acts**, inside a story.

- [ ] With two or more summarised chapters, the button names the range it will take.
- [ ] Roll them up. Their own summaries stop being sent and the act stands in for them.
- [ ] **Context** should show fewer EARLIER rows and fewer tokens against them.
- [ ] Remove the act. Those chapters send their own summaries again.

> This is the thing that stops a long book forgetting itself, and it had no way in until now. What
> it does NOT fix: which summaries get dropped when you have not rolled up. See F31 — at chapter
> 120 the survivors are chapters 6-9, 52-55 and 96-99, which is nobody's idea of a memory.

## 8 · The prompts, in your words

**Storyteller → The five modes, in your words.**

- [ ] Open **Speak**. The box holds the wording that ships, not an empty field.
- [ ] Rewrite it and **Save**. Open **Context → Prompt sent** and read it there — what you typed is
      what the model gets, with `{{speaker}}` filled and nothing added.
- [ ] Press **Default**. The shipped wording comes back.
- [ ] It is **global to you**, not to this story. Check it in another story.

> Not built, and it is DECISIONS §3: an override REPLACES, it does not merge with the shipped
> wording, and nothing validates it beyond refusing a blank. A prompt that produces nothing
> produces nothing, and the way back is one press.

## 9 · Delete, and the model list

- [ ] ⋯ → **Delete** on a passage with more than one take. It says **Delete take 2**, asks once,
      and deletes on the second press.
- [ ] The other takes are **still there** afterwards. They used to stay in the database, invisible.
- [ ] **Preferences** and **Storyteller → Model** read as names now: *Write · Qwen3.6*, *no
      thinking · uncensored*. The raw id is one hover away.

> Two guesses in those names that are yours to confirm: I read `t`/`nt` as thinking and `-h` as
> uncensored.

---

## Still open — COUNCIL-04, worst first

Two came off this list in round three. Six left, and the order is still yours to set.

- ~~**Two of the five mode prompts produce slop.**~~ Done, F29 — and it was three, not two: `act`
  carried the same checklist in different words. Measured: the shape was being filled **10 times out
  of 10**, now 5. The spice levels were re-cut in the same sitting. **What is left of this item is
  ~~the editor~~. Built: **Storyteller → The five modes, in your words**. A full replace, global to
  you, and Default is Save with an empty box. `{{directive}}` and `{{speaker}}` fill the way the
  shipped ones fill them. What is NOT built is the rest of DECISIONS §3 — there is no composition
  (an override replaces, it does not merge) and no validation beyond "not blank", because a prompt
  that produces nothing produces nothing and the reset is one press. Say if you want more than that.
- ~~**The canon checker only checks entries that fired.**~~ Done. The check reads the **whole
  ledger** now and each flag records whether that entry reached the prompt. A flag on canon the
  engine never sent reads **Never sent** in amber, not **Contradiction** in red — different fault,
  and the fix is a trigger word rather than a rewrite. The repair still judges the model against
  only what it was told, because asking it to honour canon it never saw is asking it to guess.
- ~~**Firing is imprecise at scale.**~~ Done. A multi-word key now needs its words **in order and
  close together**, so `iron bridge` no longer fires on *"The bridge was iron"* and `Kade Ashford`
  no longer fires on Kade Ferrin plus Lord Ashford a clause apart. Both are COUNCIL-04's own real
  false fires and both are now tests.
- ~~**Chapter 120 does not fit** and `POST /api/rollup` has no caller.~~ Done — **Chapter → Acts**,
  and the button works out its own range. F31 measured it: 65 of 117 summaries drop, five acts over
  a hundred chapters cost 4,083 tokens against 11,440, and nothing drops.
- **Eviction order is backwards** (COUNCIL-04 #8), and F31 turned it from an argument into a
  measurement. What survives at chapter 120 is **6-9, then 52-55, then 96-99** — scattered runs
  with holes, and the newest summary is not kept either. COUNCIL-04 #9 said "oldest-first"; it is
  not. A book missing chapters 10 to 51 contradicts itself in the middle and cannot say why.
- **Plot threads are not tracked.** The one absence named as stopping a serial writer.
- Smaller: four of seven done — `serve.ts`'s gate is now proved by a real server running as the
  other writer; `endChapter` is one transaction; the `.db` import is refused before it is written
  rather than after; and the export carries `spice_note`, `max_context`, `model` and the locked
  character. **Left**: two in-flight races can leave the Context panel describing the previous
  book, and the composer still eats drafts on panel-open and chapter-paging.

Full write-up with line numbers: `docs/findings/COUNCIL-04.md`.

---

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
- **F31** — chapter 120 forgets 65 chapters in scattered runs, not its beginning. Acts fix the
  fitting; the scattering is a separate defect and is not fixed.

Read F28's last section if you read nothing else: **the detector was wrong twice**, and the second
time it survived a fixture built to fix the first, because the model re-genders characters against
canon. Every rate in it is a floor.

---

## Running the tests

```bash
node --experimental-strip-types test/all.ts    # 158 checks, nine suites, no model needed
test/ui/run.sh                                 # 10 scenarios, headless browser, no model
test/ui/run.sh "model ritual"                  # the two that wait on real generations
node --experimental-strip-types bench/lockout.ts check    # F28 detectors, no model
node --experimental-strip-types bench/modes.ts check      # F29 detector, no model
```
