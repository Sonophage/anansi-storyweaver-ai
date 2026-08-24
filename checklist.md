# Walk it yourself — 2026-08-24

Your server is running on **http://127.0.0.1:5174** with all of today's work. If you restart it,
plain `node --experimental-strip-types serve.ts` from the repo root is enough.

Everything you had already checked and confirmed has been cut from this file. What is below is
what changed today and what you have not seen working. Roughly twenty minutes end to end.

Your library holds **The Static Between Stars** (1 chapter, 3 entries, 3 passages). Some steps
below want a second story, and the importer makes one.

---

## 1 · The importer, on your own files

The three files are still in `~/Downloads/`. This is the one you flagged as *"may work for you but
its not hooked up on my end"* — it was not, and the parser had never seen a real export.

- [ ] **Import → choose `sutera-remembers.md`.** It previews as an **AI Dungeon adventure**,
      titled **Sutera: Remembers**, **357 passages, 40 of them yours**, and says nothing has been
      written yet.

- [ ] Press **Create the story**. Open it. The prose is there, and the lines you typed in AI
      Dungeon read as *yours*, not as the model's. That is what the `>` marker in the export
      means, and losing it makes the whole adventure read as if the model wrote it.

- [ ] **Import → Pick a different file → `adventure--Ws97mWzhCST-story-cards-5.json`.** Five cards
      preview, each with its own type and trigger words.

- [ ] Set **Where it goes** to **Into Sutera: Remembers**. The button changes to *Add to Sutera:
      Remembers*. Press it. The five cards join that story and **no second story appears**.

- [ ] **Do the same import again.** It says **0 new, 5 updated**. Not ten cards.

- [ ] **`main_althiel-saelith-25cba0d4_spec_v2.png`** previews as a *character card
      (chara_card_v2)* and imports as its own story.

> Why it was broken: AI Dungeon exports one adventure as **two** files now — a bare array of story
> cards, and the prose as markdown. The parser expected the old single-file JSON and refused both.

---

## 2 · The composer — five modes

Open **Sutera: Remembers** (or any story). Everything here is on the bar above the input.

- [ ] The bar reads **Continue · Speak · Act · Direct · Narrate**. No *New scene*.

- [ ] **Continue** with the box empty writes the next beat. Now type something and press Continue
      anyway — what you typed must **not** get smuggled into the prompt.

- [ ] **Speak.** Type a line and press **Enter** (Enter alone — it used to need ⌘). Your line goes
      onto the page as *yours*, and Anansi answers around it.

- [ ] With Speak selected there is an **as** dropdown on the right, defaulting to you and listing
      the cast. Pick someone else — your line goes down as theirs.

- [ ] **Act.** Type what you do. It lands as **narration**, not as a quoted line. That difference
      on the page is the thing to look at.

- [ ] **Direct.** Type an instruction. Anansi writes from it and **your instruction never appears
      in the story**.

- [ ] **Narrate.** Write a paragraph yourself. It goes down verbatim as yours and Anansi carries
      on *from* it. Leave a sentence unfinished and it should pick up mid-thought.

- [ ] Write a line in **Direct**, then press **Speak**. The line survives the switch.

- [ ] **Shift+Enter** still makes a newline.

- [ ] Below the input: **no "Each take is kept"**, and no last-take timing.

> Your report — *"the ai prompt seems to be the only thing captured"* — was exactly right. Every
> mode turned typed text into a directive, so your words went into the prompt and never onto the
> page.

---

## 3 · Regenerate and History

- [ ] On any passage, **⋯ → Regenerate**. Then **⋯ → History**.

- [ ] History has two sections: **Takes** and **Edits**. Both takes are listed, one marked *in the
      story*.

- [ ] **Put this one in the story** on the other take actually swaps what the document shows.

- [ ] Each take shows **Written against** with the canon entries that were in *its* prompt.

> Two takes in one slot came from two different prompts — a keyword that fired for one and not the
> other changes what the model knew — and nothing recorded which. Regenerating writes a *variant*;
> editing writes a *revision*; History only ever read revisions, which is why it said "not edited".

---

## 4 · The six menus

- [ ] The rail inside a story reads **Story · Chapter · Threads · Context · Search · Storyteller**.

- [ ] **Chapter** holds all of: its name, *this chapter must end with*, where the story is going,
      what the chapter added, the summaries in context, its branches, and **End this chapter**.

- [ ] **Change "Where this is going" on Chapter and press Save.** Then open **Story**: title,
      genre, premise, setting, point of view and register are all still there.

      > This was broken before today. `updateStory` was a full-row update and the client only ever
      > sends what is on screen, so the old Trajectory panel's Save — one field — answered **500**.
      > It threw rather than wiped, so nothing was lost, but that button had never worked.

- [ ] **Story** no longer holds the chapter's fields. Take it with you / Delete are still at the
      bottom.

- [ ] **Threads** shows **Characters, Lore, Items, Rules**, grouped, with a New button for each.
      It used to show characters only, so lore had no home inside a story.

- [ ] **Context** is fourth in the list, not first. The **Inspector** button is gone from the top
      bar; the `Context NN%` reading stays and still opens the panel.

- [ ] Paste `#<story-id>/inspector` in the address bar — you land on **Context**. `/cast` lands on
      **Threads**; `/traj`, `/queue`, `/branches` land on **Chapter**.

---

## 5 · Search

- [ ] **Search** inside a story. Type something in your prose.

- [ ] **Click a prose result.** It jumps to that passage, marks it, scrolls it to the middle and
      gets the panel out of the way. The mark fades after a few seconds on purpose.

- [ ] **Click an entry result** — it opens that entry's editor. A **summary** result opens Chapter.

- [ ] **Add to the lore book**, under any result. It writes the entry, names it from the text and
      opens it. It arrives as **triggered with no trigger words**, so it does not fire yet — an
      always-on entry made from a highlight would cost tokens on every call before you had looked
      at it. The toast says so.

> Search spans every story you own, so a result may belong to a different one. Adding to the lore
> book puts the entry in *that* story's ledger and takes you there. That is deliberate.

---

## 6 · Spice and tags

- [ ] **Story → Spice.** Six options now. The written box only exists when **Custom — say it
      yourself** is chosen.

- [ ] Choose Custom, write a register, Save. Then pick a **level** again and Save. The written
      line is **cleared** — a story is on a level or on a written register, never both, and
      leaving it would go on silently overriding the level you just picked.

- [ ] **Set a story's genre to `fantasy, noir, heist`** and look at the library: **three pills**,
      not one pill reading "fantasy, noir, heist". That is what an AI Dungeon import writes into
      that field, so it was the normal case for an imported story.

---

## 7 · The end-of-chapter ritual

- [ ] **Chapter → End this chapter.** It closes the chapter, summarises it, reads it for facts,
      and opens the next with a setup page.

- [ ] The setup page takes the next chapter's **name**, what it **must end with**, **who is in
      it** and **where**. Ticking a character pins them into the chapter as canon.

- [ ] What it proposes for the ledger is **not accepted automatically** — it waits for you.

---

## Still open — not oversights

These are the things you asked for that are not built. Each one says what it needs, so it is a
starting point rather than a reminder.

### Start blank needs a screen

> if were starting blank then the user needs a screen to fill in all these things themselves not
> just start a blank story.

Spark works and returns a skeleton. **Start blank** still just creates `Untitled` and drops you in
the editor. It should ask for the same things Spark fills in — title, genre, premise, setting,
point of view, who you are, style, register — before the first passage.

### Preferences: your name, and a writing dashboard

> preferences this should allow the user to change their name see their stats of writing open
> stories characters etc. just a user stat analytics dash may be useful here.

Neither exists. The name is a hard-coded owner in `serve.ts` — there is a `ponytail:` marker on it
saying exactly that. The numbers for a dashboard are all already in the database: passages,
chapters, entries, generations with timings.

### Characters — the design conversation (PLAN-04 §3 onward)

> this might also have a skill to create the character so that we can prompt and it creates
> something. this should also have a reroller mechanic. it would also be beneficial to have a
> costume and a selector for it so that way things like armor can be taken on or off without it
> being an issue when prompting. were also missing internal thoughts of the characters and their
> threads to the main character or others in the scene.

Four separate things, none built:

- **Character by prompt, with a reroller.** Same shape as Spark, aimed at one character.
- **Outfits.** Designed with you as a named table with a partial unique index — one worn at a
  time — rather than a free "right now" line.
- **Interiority.** Deliberately behind a measurement first: does putting a character's inner
  state in canon leak into the narration.
- **Threads between characters.** Agreed as a text field on the entry, not a new table.

### New scene → New lore

> new scene button should be replaced by new lore button. that will say to scan what we have, or
> create a new character, place item etc.

New scene is gone from the composer, but nothing replaced it. What you described is a button that
either reads the chapter for facts — which the chapter ritual already does — or opens a new entry
of a chosen type.

### Regenerate should mark the take you rejected

> the regenerate should prompt to try a different entry marking that the one used wasnt good.

Half done: each take now records the canon its own prompt carried, and History shows it. Nothing
marks a take as rejected, so nothing can steer the next one away from it.

### The model selector — answered, not built

> is ther anyway around that? two harneses think how pi and prime agent are two harnesses the same
> idea would start here.
> for the model selector could i as admin turn on and off what models are available for this app?

Two harnesses is real, and the blocker is this codebase rather than llama.cpp:

- every request already names its model (`model: MODEL` in each `post` in `src/llama.ts`)
- your router spawns a **separate `llama-server` process per preset** — eight on disk,
  `write-nt-qwen36-h` loaded
- so `MODEL` being one module-level global is the only reason switching is process-wide

Per-story model is therefore a small code change. The real constraint is VRAM: two models loaded
at once means both sets of weights resident, and at 96 GiB two 35B-class models is tight but not
obviously impossible — that wants measuring, not guessing.

The admin allowlist sits on top: a list of permitted model ids, filtered in `GET /api/models`.

---

## Not built on purpose

- **Homepage / login.** One hard-coded owner, no auth. `serve.ts` carries the `ponytail:` marker.
- **A model selector inside the story.** It is in Preferences because the model is process-wide;
  it moves into the story the day per-story models land.

## Settled, no action

- *"create a story works beautifully"*
- *"themes make sure the theme is easy to build upon. but the way it works now is good"* — themes
  are CSS custom properties on `html[data-ui-theme]`; adding one is a block of variables.
- The `Context NN%` reading stays on the top bar. You confirmed you want it.

---

## If you want to run the tests

```bash
node --experimental-strip-types test/all.ts    # 109 checks, six suites, no model needed
test/ui/run.sh                                 # 10 scenarios in a headless browser, no model
test/ui/run.sh "model ritual"                  # the two that wait on real generations
```
