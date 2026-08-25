# Walk it yourself — round three, 2026-08-24, evening

Round two is gone from this file: every item on it is built and covered by a test. What is below
is what landed while you were out, and it is a lot — five editor modes, the importer, the ritual,
per-story models, Anansi, outfits, a naming pass, and streaming.

**Restart the server first.** The one on 5174 started at 19:35 and HEAD is 20:20 — it is running
code from before streaming, and the page will tell you so if you forget.

```bash
node --experimental-strip-types serve.ts     # http://127.0.0.1:5174
```

You are on **Sutera Remembers**, chapter 2, 358 passages.

Twenty minutes. Bugs go in `bugs.md`, under the matching heading.

---

## 1 · The words changed everywhere — is it right?

This is the one I most want your eye on, because it is your voice and I have already been wrong
about it once. Six words for one thing became **threads**.

- [ ] The rail says **Threads** inside a story, and **Threads** in the workspace.
- [ ] The composer button says **+ Thread**.
- [ ] A search result offers **Add to threads**; accepting one toasts **Woven in.**
- [ ] A story card says **12 threads**, not "12 in the ledger".
- [ ] **Context** still says **CANON** — on purpose. It is the engine's window and canon is the
      engine's word for what reaches the prompt. Tell me if that reads as a seventh word rather
      than as the one place the engine shows through.

> I built this as *canon* first, then found your own note in `DECISIONS.md` §6 and moved. The cost
> is written down there: the serial-writer reviewer wanted **threads** for **plot promises** — the
> letter unopened in chapter 6 — so if that ever gets built it needs a different word.

---

## 2 · Streaming — the passage arrives as it is written

- [ ] Press **Continue**. The prose appears **a fragment at a time**, dimmed, with a caret, at the
      end of the chapter.
- [ ] It is replaced by the real passage when it finishes. Nothing is saved until then.
- [ ] Press Continue **again straight away**. The first word should arrive in **about a third of a
      second** — the model keeps the prompt cached between calls.
- [ ] The **first** call after the model has been asleep is still slow (~8s to the first word) and
      shows the working bar. That is prompt processing; streaming does not touch it. F24.
- [ ] **⋯ → Regenerate on the last passage** streams too. Regenerate further up does not, on
      purpose — the take replaces a paragraph you can already see.

---

## 3 · The voice sample actually reaches the model now

**Storyteller → Voice of the weave.**

- [ ] Paste **a few hundred words of your own prose** — take them from Sutera.
- [ ] Open **Context**. There is a **VOICE** block near the top, and it is **not shortened**.
- [ ] Read the prompt (Context → the prompt view). The sample is **verbatim, unbracketed**, inside
      `<voice>`, under one line telling the model it is a specimen and not part of the story.

> It used to be `[Voice: …]` sharing a 250-token cap with point of view, the chapter's ending and
> the register — so following the field's own hint guaranteed it was cut, and cut first, mid-word.
> Spice 4 and 5 promise *"Vocabulary follows the writing sample"*; that is true for the first time.

---

## 4 · Write into chapter one

The thing I told you was deliberate, and was not.

- [ ] Page back to **chapter 1**. Type a line. Send.
- [ ] It lands **at the end of chapter 1**, and **you stay in chapter 1**.
- [ ] The **Context** panel shows chapter 1's context, not the end of the book.

> `/api/write` never received a chapter, so every passage went to `chapters.at(-1)` — off-screen,
> against the wrong context. `DECISIONS.md` §5 described the correct behaviour and offered you three
> options about it; the code was doing none of them. Fixed, tested through the route.

---

## 5 · Anansi — the chat panel

Rail → **✻ Anansi**, inside a story.

- [ ] Ask something about Sutera. It answers from the ledger and the chapter summaries, and cites
      what it drew on.
- [ ] Ask it for something that is not in the story. It should say **it does not say** rather than
      invent.
- [ ] Ask it to set something up. It may offer a **directive** — that lands in the composer, in
      Direct mode, **unsent and editable**. It never writes into your book itself.
- [ ] It may offer **threads**. They go to the proposals queue, same as extraction; nothing is
      canon until you accept it.
- [ ] The conversation is **ephemeral** — reload the page and it is gone. Say if you want it kept.
- [ ] **Search the web** is present and **off**, with the reason next to it.

---

## 6 · Outfits

**Threads → a character → Wardrobe.**

- [ ] Add two outfits. Wear one. Only one can be worn — the database enforces it, not the screen.
- [ ] **Context** shows the entry with a **second bracket**: `[Ilva wears: …]`.
- [ ] Give that character a **chapter state** as well (*From chapter N*). The outfit must **survive**
      — the state rewrites the body and used to take the outfit with it, silently, while the panel
      still said "worn".

---

## 7 · Import

- [ ] **Import** an AI Dungeon export or a character card. The **preview** says what it will add
      before anything is written.
- [ ] Import the **same file twice into the same story**. Nothing duplicates — including outfits,
      which used to double every time.

---

## 8 · Per-story models, and putting the machine to bed

**Preferences**, and **Storyteller → Model** inside a story.

- [ ] A story can **name its own model**. Saving a model the router does not serve is refused, with
      the router's own message.
- [ ] **Restart it** and **Release the models** both work. Release stops the unit; the next
      generation says **"cannot reach llama-server … Preferences → Restart it"** rather than
      `fetch failed`.

---

## Still open — and none of it is waiting on me

These are COUNCIL-04's findings that I have not fixed, worst first. Say which matter and I will
take them in that order.

- **The Context panel drowns at 358 passages.** Ninety-six identical `PROSE / prose 60% ceiling`
  rows under the seven real ones, none clickable, under a footnote that says every row is. They
  should collapse to one row with a count.
- **Delete orphans every alternate take.** No confirm, no undo, and ✕ Delete sits next to
  ↻ Regenerate. It does not promote a sibling, so the other takes stay in the database, invisible.
- **Two of the five mode prompts produce slop.** Speak's *"speech, action, the room"* is a
  checklist and a checklist gets filled — reply, gesture, weather. Direct and Continue carry length
  targets, which is F18's defect pointed at prose.
- **The canon checker only checks entries that fired.** One rule decides both what the model is
  told and what gets verified, and they fail together.
- **Firing is imprecise at scale.** A 46-entry ledger fired all 46 for an eight-person scene.
  `iron bridge` on *"the bridge was iron"*. The proximity bound `context.ts` deferred "until a real
  ledger false-fires" — it does now.
- **Chapter 120 does not fit** and `POST /api/rollup`, which fixes it, has no caller in the UI.
- **Plot threads are not tracked.** Nothing registers an open promise. Named as the one absence
  that would stop a serial writer using it.
- Smaller: `serve.ts` has no node-suite coverage and it holds the gate; `endChapter` is two writes
  with no transaction; `.db` import is uncapped; two in-flight races can leave the Context panel
  describing the previous book; the composer still eats drafts on panel-open and chapter-paging;
  and `db.ts:138`'s `ponytail:` marker is false, which matters because that ledger is only worth
  its accuracy.

Full write-up with line numbers: `docs/findings/COUNCIL-04.md`.

---

## Four decisions still want a line each

`docs/plans/DECISIONS.md`. Two closed themselves since round two — §5 was a bug, and §6 is done.

1. **Interiority's shape**, now F21 has measured it. My recommendation is option A: build nothing.
2. **The 82.5%** — the model narrates the protagonist's inner state in 82.5% of generations with
   nothing in canon at all. Do you want that lower? Nothing has ever aimed at it.
3. **Per-account prompt overrides** — where stored, how they compose, what a bad one does.
4. **Character by prompt**, and what "reroll" re-rolls.

---

## Measured while you were out

`docs/findings/P0-FINDINGS.md`.

- **F21** — canon interiority comes back as narrator statement 47.5% of the time, and the model
  already narrates interiority 82.5% of the time with nothing in canon.
- **F22** — I was wrong that two 35B models would be tight. The writer is a 35B-**A3B** at 25.9 GiB.
  Any two fit; three fit in several combinations.
- **F23** — thinking and structured output do not compose. I argued for thinking ON in Anansi's
  chat; **3 of the first 5 real calls failed** with unparseable JSON. F5 is not a fact about prose,
  it is a fact about this model's budget under a token cap.
- **F24** — the blank page was prefill, and prefill is nearly free warm: **7.8s** cold, **0.35s**
  on the next call. One average was hiding two numbers, including the council's own p50.

---

## Running the tests

```bash
node --experimental-strip-types test/all.ts    # 138 checks, eight suites, no model needed
test/ui/run.sh                                 # 10 scenarios, headless browser, no model
test/ui/run.sh "model ritual"                  # the two that wait on real generations
```
