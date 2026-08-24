# Check it yourself — 2026-08-23

Everything below is checked against your `bugs.md`, in the same order you wrote it. Tick what
holds. **Anything that fails, write it under the item** — that is faster for me than a fresh list.

Open **http://127.0.0.1:5174/**. The old two surfaces are still at `/desk` and `/phone` if you
want to compare. Resize the window to check the phone layout, or open it on your phone over
Tailscale.

Branch: `ui-overhaul`. Nothing here has been merged to `main`.

---

## Before anything else — the one that blocked everything

- [ ] **Click into any text box and type.** The story title, the composer, the spark box, the
      search boxes. All of them should accept text.

      This was the bug behind *"all text boxes trigger the menu meaning nothing is editable"*. The
      theme state on `<html>` shared an attribute name with a click action, so **every click in
      the app toggled the rail and repainted**, destroying whatever you were typing in.

- [ ] **Type in the two search boxes** — the one on Worlds & lorebooks, and Search inside a story.
      Both used to eat your keystrokes for a related reason. Search Worlds for `brass`; you should
      get the Silver Key entry.

---

## Homepage / login

- [ ] Nothing to check. **Not built, on purpose.**

      There is no identity yet — one hardcoded owner in `serve.ts:13`. A sign-in screen that
      authenticates nothing is theatre, so I left it for the Tailscale work (P3). That is also
      why you cannot test the login page: there is no login.

      The design's marketing/about page is a separate file, `Anansi Landing.dc.html`, and is
      likewise not built.

---

## All stories page

- [ ] **The story you wrote into last is a hero card** at the top, with its premise, chapter,
      ledger and passage counts, and a **Last written** badge.
- [ ] **New story is the next tile**, before the other stories.
- [ ] **The pill on each card is the genre** — "Fantasy noir" on The Silver Key, not
      "IN_PROGRESS". A story with no genre still shows its status instead.
- [ ] **Setting the genre**: open a story → Story & chapter → Genre. It is also on the card
      immediately after saving.

---

## Create a story

- [ ] **Spark a skeleton** takes your idea and returns a story. This works and always did.
- [ ] **Start blank still just makes an empty story.** ❌ **Not done.** You asked for a screen
      where you fill all the fields in yourself. That is a new screen, not a fix, so it is in the
      design conversation queue.
- [ ] **The idea box accepts typing** — this is the box you specifically could not write into.

---

## Worlds and lorebooks

- [ ] **Entries are grouped under the story they belong to**, with a count and an *Open story*
      link per group. A story *is* the lorebook — entries are story-scoped in the schema and
      there is no separate lorebook table, so this is the honest reading of "separated by
      lorebook". Say if you meant something else.
- [ ] **A type filter**: Everything / Character / Lore / Item / Rule.
- [ ] **A search across every book**, which is the case you named — when you cannot remember
      which story an entry is in.
- [ ] **Clicking an entry opens it** in the panel on the right: name, type, whether it reaches
      the model always or on a keyword, the info the model actually reads, trigger words, and
      your own notes marked *never sent to the model*.
- [ ] **Type and activation save on the click**, not on Save — the trigger-words field switches
      on and off with activation, so it has to redraw.
- [ ] **Editing an entry from this page needs its story open.** The panel says so. That is a real
      limit, not an oversight: the write route is scoped to one story.

---

## The importer

- [ ] **Import a real AI Dungeon export.** Import &rarr; pick `sutera-remembers.md`. It should
      preview as an *AI Dungeon adventure*, titled **Sutera: Remembers**, 357 passages, **40 of
      them yours** — and say nothing has been written yet.

- [ ] **Then bring the cards into that same story.** *Pick a different file* &rarr;
      `adventure--Ws97mWzhCST-story-cards-5.json`. Set *Where it goes* to **Into Sutera:
      Remembers**. The button should change to *Add to Sutera: Remembers*. Five cards join it;
      **no second story appears** in the library.

- [ ] **Import the same cards again.** It should say **0 new, 5 updated** — not ten cards.

- [ ] **The chub.ai PNG.** `main_althiel-saelith-25cba0d4_spec_v2.png` should preview as a
      *character card (chara_card_v2)* and import as its own story.

      **What was wrong, since you were right to be sceptical.** Your AI Dungeon export was being
      *rejected outright*. The parser expected the old whole-adventure JSON; the app now exports
      two files — a bare array of story cards, and the adventure as markdown with your own turns
      on lines beginning `>` — and neither matched. Every test I had ran against a fixture I wrote
      myself, which is exactly the failure mode those tests could not catch.

      Now measured on your files: 357 passages, 40 yours, 5 cards merged into one story, and the
      prompt assembles at 28,100 of 46,146 tokens with the imported canon firing from its keys.

- [ ] **One importer now, not two.** The client has no parser at all: it sends the bytes and
      renders what `src/import.ts` made of them. The §3b conflict is closed.


---

## Preferences

- [ ] **A model selector.** All eight of your router's models, with which are loaded, sleeping or
      unloaded. Clicking one switches the engine to it.
- [ ] It says plainly that **switching is process-wide, not per story** — two writers share the
      server, so it changes for both.
- [ ] **Changing your name and a writing-stats dashboard**: ❌ **not done.** Your name needs
      identity to exist first (same blocker as the login). Stats are a new screen — queued for
      the design conversation.

---

## Context (inside a story)

- [ ] **A Blocks view and a Prompt sent view.** Prompt sent is the exact text the next call will
      send, in order, with nothing added between it and the model.
- [ ] **Every block row is a button.** Click one and it takes you to what put it there — a canon
      row opens that entry, EARLIER opens Trajectory, spine and directive open Story & chapter.
      That is the "these things are editable on their own page and this serves as a quick setting
      change" part.
- [ ] **A readable log of what was actually sent** — that is the Prompt sent view. Note it shows
      the **next** call. A log of *past* calls exists per story under Storyteller (tokens,
      prefill, latency) but not their full prompt text. Say if you want the old prompts kept; that
      is storage, and `generations` already holds the manifest for every call.

---

## Characters

- [ ] **Clicking a character opens it** with all its settings.
- [ ] **New character creates one and opens it.**
- [ ] ❌ **Not done, all queued for the design conversation:** a character-creation skill you can
      prompt, a reroller, costumes and equipment slots so armour can come on and off without
      confusing the prompt, and the characters' internal thoughts and their threads to each other.

## Story and chapter

- [ ] **Setting is a dropdown** fed from the lore and items in the ledger.
- [ ] **You are is a dropdown** fed from the cast.
- [ ] **Point of view is a hardcoded list**, as you asked.
- [ ] A value the ledger does not hold is **kept and labelled** *"— not in the ledger"* rather
      than silently dropped.
- [ ] **Spice has a written-out override.** Leave it empty and the level's line is used; write in
      it and yours replaces the level entirely in the prompt. Check it lands: write something in
      it, Save, then Context → Prompt sent, and find your words.
- [ ] **Save works.**
- [ ] **End chapter here works** — but it is the plain version. ❌ The **ritual** you described —
      scan the chapter, update the ledger, then open a setup screen for what happens next, who is
      in it and where — is **not done**. Design conversation.
- [ ] **A model selector at the bottom**: it is in Preferences instead, because the model is
      process-wide and not a property of one story. Move it if you disagree.

---

## Main story screen

- [ ] **Every passage has a `⋯` handle.** The actions used to appear only on hover, which meant
      **Regenerate, Edit and History did not exist at all on a phone.** Now the handle is always
      there, hover still works with a mouse, and on a phone the tray opens inline as icons — that
      is your "on mobile they should be icons".
- [ ] **Edit** puts the caret in the passage. Click away and it saves.
- [ ] **History** lists every replaced version with a Restore, and offers **Branch from this
      passage** — the branching-from-that-spot you asked for.
- [ ] **Delete** still works.
- [ ] **Regenerate** is on the top bar and re-rolls the last passage, keeping the old take as a
      variant. Step between takes with `‹ ›` on the passage.
- [ ] **Discard and Keep are gone.** A take is kept as it arrives. Nothing is lost by that —
      Delete, History and the variant stepper are all on the passage.
- [ ] ❌ **Regenerate does not yet mark the take you rejected as bad.** It keeps both as variants
      but records no preference. That needs a column and is worth doing deliberately.
- [ ] ❌ **New scene has not been replaced by New lore.** That is a new feature — scan, or create
      a character/place/item — not a rename. Design conversation.
- [ ] ❌ **Speak has no selector** for driving a ledger character or the narrator. It speaks as
      the story's persona only. Design conversation.
- [ ] ❌ **Direct** currently writes prose from your instruction. You described it as writing
      your instruction **into canon** as a prompt. That is a different behaviour and I did not
      want to change it on a guess.

---

## Things I found that you did not report

Worth a look because they were real:

- [ ] **On a phone, the whole app was behind an 8px blur.** The bottom sheet sits over the full
      screen and hiding it cleared the background but not the filter.
- [ ] **A canon flag printed 3,321 characters of the model's reasoning** into the document. Flags
      clamp to two lines, expand on click, dismiss on shift-click — **and F18 is now fixed
      underneath**, so the clamp is no longer covering a live defect. The reason is bounded at 240
      characters in the schema, measured to cost the checker nothing: F1 0.89, exactly as before.
- [ ] **Chapter summaries were analytical rather than narrative** — *"This action confirms his
      intent to leave permanently"*. **Fixed and measured.** Close a chapter and check the summary
      under Trajectory: it should read as what happened, not what it means, and be short when the
      chapter was short. Mean length went from 1,155 characters to 181 with no facts lost.

      The cause was the word count reading as a **target**: a 160-character chapter came back as
      1,269 characters of invention because "180 words" has to be hit. It now says "Under 180
      words. Shorter is better."
- [ ] **The two old surfaces are gone.** `desk.html` and `phone.html` are deleted; `/` and
      `/phone` both serve the one responsive page, so an installed home-screen icon still works.
- [ ] **Accept in "What the chapter added" was throwing the fact away.** ⚠ This one is worth
      checking on purpose. The route branches on a key called `accept`; the screen was sending one
      called `decision`, so `accept` was undefined, the entry was never written, and the proposal
      was marked **rejected**. Clicking Accept discarded exactly what you were accepting.

      Fixed. Close a chapter, open the queue, accept something, and confirm it appears in Worlds &
      lorebooks. Note that accepting a **changed** proposal updates an existing entry rather than
      adding one — the count will not move, and that is correct.
- [ ] **Search inside a story was broken three ways.** Clicking a result said *"no such story"*,
      because a result carried the story's **title** where the code wanted its **id**. The
      location line under each result was always blank. And the panel claimed it searched
      *"prose, entries and summaries"* while searching prose only.

      All three fixed, and the claim made true rather than downgraded: search now covers prose,
      ledger entries and chapter summaries, each labelled, each saying which story and chapter it
      came from. Try searching a character's name — you should get the entry and the passages.
- [ ] **Five features had quietly lost their screen when I deleted desk and phone.** ⚠ The
      engine, the routes and the schema were all fine, so every test stayed green — I had checked
      that the new surface worked, never that it covered the same ground.

      Wired back and driven: **progressions** (a fact that opens at a later chapter — add and
      remove them in the entry editor, under *Over time*), **entry field history** with a
      per-field *Put this back*, **export** as Markdown, JSON or a standalone database, and
      **deleting a story**, which takes two presses.

      Pins and arcs are still without a screen, now on a deferred list *with reasons* rather than
      silently missing. A test asserts every other engine feature has a caller.
- [ ] **The send button did nothing.** ⚠ Worth a deliberate look. `generate()` had exactly one
      caller — the ⌘↵ shortcut — and the arrow button carried no action, so it was decorative.
      **On a phone there is no ⌘↵, which made the app's primary action unreachable there entirely.**
      Fixed and driven: clicking it appends a take.
- [ ] **Spark produced nothing you could see.** You would type an idea, wait ten seconds, and
      watch the page do nothing. `/api/spark` returns a *skeleton*, not a story, and the page was
      looking for a story id that never comes.

      The review step now exists, which is what the design and SPEC §8.1 both ask for: the panel
      fills with title, genre, premise, setting, point of view, spice and voice, all editable, and
      each proposed cast member has a **keep this one** tick. *Accept and start writing* is the
      thing that actually creates it. Nothing is written before that.
- [ ] **Speak needed two presses to get an answer.** It saved your line and stopped, so you had
      to press send again on an empty box. One press now writes your line as yours and gets the
      reply — and your line is not re-recorded as an instruction.
- [ ] **The composer stayed tall after a long directive.** Clearing the text left the box's grown
      height behind.
- [ ] **Setting a low context cap showed "Context -168%".** If you set a story's context cap
      below the space reserved for the reply, the budget went negative and the surface printed
      nonsense: *406 / -242*. The engine was refusing correctly the whole time; only the display
      was wrong, and the message blamed SPINE when the real problem was the cap.

      Now the header says **No room**, and Context explains it: the cap leaves nothing after the
      reply, raise the cap or lower Max tokens. Try it — Story & chapter has no cap field yet, so
      you would have to set it through the API; it is on the list.
- [ ] **Hostile text is safe.** Not a bug found, a class checked: a story title, entry, passage
      and spice note each carrying `<script>`, an `onerror` image and a quote-breaking attribute.
      Nothing executed anywhere, the text renders literally, and a name with real quotes and curly
      apostrophes — *The "Bell" — it's Aldis's, isn't it?* — round-trips intact.
- [ ] **Storyteller was telling you something untrue.** ⚠ It said *"These belong to this story.
      Change them mid-chapter and only what comes next is affected."* The sampler is **one object
      for the whole server** — `serve.ts:24` — so changing temperature changed it for every story
      and every writer. The route takes a story id, which makes it look per-story; it is not.

      The panel says so now. The real fix is PLAN-02's `engine_config` on the story row, which was
      listed in P1 and never built. Say if you want per-story sampling and I will build it.
- [ ] **Your sandbox holds, and is now asserted.** Search, the cross-story ledger and import were
      the three routes that bypass the ownership gate by design — their only protection is the SQL,
      and nothing tested it. Now tested with two owners, both directions. Search unions prose,
      entries and summaries, and each branch needs its own filter; all three are there.
- [ ] **End of chapter is a ritual now.** Story & chapter → **End this chapter**. It closes the
      chapter, summarises it, reads it for new facts, and opens the next chapter's setup — reporting
      each step as it goes. **Nothing is accepted into the ledger automatically**; the proposals wait
      in *What the chapter added*.
- [ ] **The next chapter has a setup page.** A title, what has to happen ("the beat"), who is in it,
      and where. All of it optional — a blank beat is a real choice, and the page says so. Ticking a
      character sends them for that chapter even when nobody says their name; the page lists the
      always-on ones separately, because ticking those would do nothing.

      Check the beat lands: set one, save, then Context → Prompt sent and find it near the bottom.
- [ ] **A small surprise while testing:** the type and activation chips in the entry editor do
      save immediately and do not wipe the body or keywords. I had this down as broken for four
      runs before working out my own test was reading the entry id after the click, by which
      point the list had been replaced by the editor.
- [ ] Deep links work: `#<storyId>` opens a story, `#<storyId>/<panel>` opens it with that panel.
- [ ] Story cards show real counts now; they were showing an empty progress bar with nothing
      behind it.

---

## What I could not check myself

- **Nothing has been driven with the model doing real work through this surface end to end.**
  Generate, Regenerate and End chapter all call the model. I have driven the buttons; I have not
  sat and written a chapter in it. That is the check only you can do.
- **Themes now checked.** `Aa` in the top bar switches theme, font and reading size. Parchment
  goes to a light ground with dark text; ink goes near-black. Both hold.

  One thing to decide, not a bug: **the rail and the side panel stay dark in parchment.** That is
  what the design specifies — only the document area themes. On screen it reads as a light page in
  a dark frame. Say if you want them to follow the theme instead.
- The **tablet width** (rail and panel both floating over the document, with a scrim) renders, but
  I have only looked at it, not used it.
