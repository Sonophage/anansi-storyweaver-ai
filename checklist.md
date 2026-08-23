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

- [ ] Nothing to check. ❌ **Still unverified, and you are right to be sceptical.**

      The parsers are real and have 7 passing tests — character cards V1/V2/V3, PNG or JSON, AI
      Dungeon exports, Anansi's own exports, with a guard that refuses to feed a card's
      `system_prompt` into the model. But **every one of those tests runs against a fixture I
      wrote**, so they prove my reading of the spec, not that a real file works.
      **Drop one real character card and one real AI Dungeon export into the repo and I will
      verify against the genuine article.**

      Also: the shipped Import screen and `src/import.ts` are **two different importers** that do
      not know about each other. Written up in `docs/findings/BUILD-STATE.md` §3b. Deliberately
      not blended.

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
