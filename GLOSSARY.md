# Anansi

A local-first app for writing long-form fiction with a model. These are the words for the parts
of a tale that the writer and the model share, and the only words the screens use for them.

Anansi is a spider and a tailor of stories. Both trades work in thread. **Spider words are for
making** new prose (weave, reweave). **Tailor words are for handling what is made** (chalk, alter,
mend, hem). Things keep plain or already-themed names. A word a new writer would not guess
carries its plain meaning in its tip the first time it appears.

Each term: what it means, the words a screen must not use for it (_Avoid_), and the name the code
uses where that differs (_In code_). The code keeps its own names; only the screens change.
`bench/words.ts` counts every _Avoid_ word still on screen.

## The tale and its parts

**Tale**:
What a writer writes: one story, made of scenes. Anansi is "he", and the tales are his to spin.
_Avoid_: story, stories, book, books
_In code_: story

**World**:
A collection of threads that tales draw on, holding no prose of its own. A tale can be cut from a
world and follow it.
_Avoid_: world book, world bible, bolt
_In code_: a story with `is_world`; a tale follows one through `lore_from`

**Account**:
A writer's own pages: You (name, picture), Model (their Featherless key file, their model), Look,
Writing (their voice, how Anansi talks, the five modes) and Your books (Import, Export, What you
have written). Added 2026-10-27.
_Avoid_: settings, preferences, profile
_In code_: the `account` page; `prefs` is still What you have written

**Library**:
Where a writer's tales and worlds are kept: the first screen. (Was "Rack" until 2026-10-27.)
_Avoid_: rack, shelf, my stories, workspace
_In code_: workspace, shelf. Not the `anansi.db` file, which the code also calls the library.

**Scene**:
One section of a tale. A tale is written one scene at a time, and a scene is hemmed when it is
done. Scenes are gathered into chapters.
_In code_: chapter

**Chapter**:
A run of consecutive scenes, whose summaries are rolled into one chapter summary that stands in
for them. A long tale reads as chapters of scenes, the way a novel does.
_Avoid_: panel, acts, an act, arc, roll-up, roll up
_In code_: arc

**Passage**:
One piece of prose in a scene, written by the writer or by Anansi.
_Avoid_: block
_In code_: passage

**Version**:
One version of a passage. Reweaving makes a new version; one is in the tale and the rest are kept.
_Avoid_: fitting, takes, a take, re-roll
_In code_: take, generation

**Opens with / Heads toward**:
A scene's brief. Opens with: how the scene starts, sent until it has prose. Heads toward: where it
is going eventually, which the model is told not to reach yet.
_Avoid_: how it starts, where it ends, direction, the beat, author's note
_In code_: `opens_with`, `authors_note`

## What the tale remembers

**Thread**:
Something the tale remembers: a character, a place, lore or an item. Each tale also has one
thread about itself. (Rules moved into the tale's thread on 2026-10-26; not built.)
_Avoid_: card, cards, entry, entries, canon, ledger, ledger entry
_In code_: entry

**Pocket**:
A named instruction inside a thread on how to write one part of it: how they talk, what they
wear, what a place feels like. Switched on or off; outfits are worn and taken off. A pocket tells
the model how to use a thing, never words to repeat. (Decided 2026-10-26; today's pockets are
still descriptions.)
_Avoid_: room, rooms, slot, addon
_In code_: addon, slot

**The tale's thread**:
The one thread about the tale itself. Its Always true is the premise and setting; its pockets are
the text the writer gives the model for the whole tale: Voice first, then the tale's rules, then
the writer's own. Spice, the cast choices and the model stay settings. It has no Over time.
(Decided 2026-10-26; not built.)
_Avoid_: story card, tale instructions, author's note

**Rule**:
A pocket of the tale's thread: a law the tale obeys, sent always or on its wake words.
_Avoid_: rule thread, constraint

**Always true**:
Who or what a thread is, which does not change through the tale. Anansi may write it only when
the thread is first made, or when the writer asks him to tidy the thread; otherwise only the writer
changes it. (Decided 2026-10-26; the screens
still say Facts.)
_Avoid_: facts, facts pocket, the core
_In code_: the `facts` addon

**Over time**:
A thread's dated record, scene by scene. Each entry is the whole of where the thread stands from
that scene on, with a short label for what changed; an outfit put on and a retirement are entries
too. The model reads Always true and the entry in force at the scene being written. Anansi chalks
each change at hemming; the writer sews it in. (Decided 2026-10-26; the screens still have Info.)
_Avoid_: info, information, body, as it stands, state, states, history (for a thread)
_In code_: `entries.body`, `entry_states`

**Always on / On a word**:
When a thread reaches the model: every time, or when one of its wake words appears.
_Avoid_: triggered, on a keyword, activation
_In code_: `activation` = `always_on` / `triggered`

**Wake words**:
The words that bring an On-a-word thread to the model.
_Avoid_: trigger words, keywords, keys
_In code_: keys

**Stitched together**:
Two threads linked so that one brings the other with it.
_Avoid_: connected, brings in with it, linked
_In code_: `entry_edges`

**Retired**:
A thread the tale is done with. It stops reaching the model; it can be brought back. ("Hemmed" is
only for scenes.)
_Avoid_: finished, hemmed (for a thread)
_In code_: `retired_at_chapter`

**String**:
A promise the tale owes and has not kept: something set up that must pay off later. Summoned
strings reach the model, which is told not to resolve them yet.
_Avoid_: owed item
_In code_: string

**Summon / Dismiss**:
Put a string in front of the model / take it away again.
_Avoid_: in play, put it away, put it in play
_In code_: `summoned`

**Tied off / Let go**:
A string the tale kept / a string it abandoned.
_Avoid_: paid, paid off, snipped, dropped
_In code_: `status` = `paid` / `dropped`

**Scene summary**:
A short record of what happened in one scene, which stands in for that scene's prose once the
tale has moved past it. It is either **yours** or **Anansi's**, by who last wrote it.
_Avoid_: synopsis, recap
_In code_: `chapters.summary`

**Yours / Anansi's**:
Who wrote a passage or a summary: the writer by hand, or the model. Fixing any part of Anansi's
summary by hand makes it yours.
_Avoid_: human-written, model-written, manual, generated

**Out of date**:
A summary whose scenes have changed since it was written. An out-of-date scene summary is not sent
until it is written again; an out-of-date chapter summary is still sent, with a warning. The
screen says which, in those words.
_Avoid_: stale, outdated, invalid

## Anansi's suggestions and the workbench

**Chalked**:
What Anansi suggests, marked in chalk until the writer decides: a new thread, a change to one, a
string, a thread to retire. Nothing chalked is in the tale. (Renamed 2026-10-26.)
_Avoid_: basted, baste, proposal, proposed, suggestion, noticed, queue
_In code_: proposal

**Sew it in / Reject**:
Keep something chalked / refuse it. The message after keeping says "Sewn in." Weave is only for
making prose.
_Avoid_: accept, weave it in, woven in, add beside it, tie it, drop, dismiss, throw it back
_In code_: `decide` accept / reject

**Knot**:
A line of narration that contradicts a thread, found after a passage lands.
_Avoid_: contradiction, flag, the checker, violation
_In code_: violation, the canon check

**Mend / Ignore**:
Ask Anansi to rewrite the passage so the knot is gone / leave the knot for this scene. "Watch
again" undoes Ignore.
_Avoid_: let Anansi correct it, listen again
_In code_: `/api/repair`, muted

**Workbench**:
Where everything that wants the writer collects: chalked things, unkept strings, knots,
out-of-date summaries.
_Avoid_: waiting, chapter queue, inbox
_In code_: the `waiting` panel

## Writing

**Reweave**:
Ask for a new version of a passage.
_Avoid_: regenerate, re-roll, roll it again, write another, ask again
_In code_: reroll, regenerate

**Alter / Alterations**:
Edit a passage by hand / the list of a passage's versions and edits.
_Avoid_: edit, edits, history
_In code_: edit, history

**Make a thread of this**:
Turn a passage into a chalked thread.
_Avoid_: remember this
_In code_: `/api/memo`

**Hem this scene**:
End the scene: Anansi summarises it, chalks what it found, and the next scene opens.
_Avoid_: end this chapter, close the chapter, ritual
_In code_: `/api/chapter/end`

**Plans first**:
The model planning, unseen, before it writes a passage, a Talk reply or an invention. A tale's
switch (off unless the writer turns it on), and what a model can do: it "never plans", "can plan"
or "always plans". The plan is never shown.
_Avoid_: spinning, weaving, thinking, reasoning, chain of thought
_In code_: `weaving`, `enable_thinking`

**You play**:
The character the writer speaks as. Every screen says "You play", the composer included.
_Avoid_: who you are, speaking as, persona
_In code_: persona

**Hands off**:
The character the model never writes: no dialogue, action or thought for them.
_Avoid_: the model never writes, hold back, held back, locked character, lockout
_In code_: `locked_character`, `lockout_on`

**Voice / Your voice**:
How a tale's narration sounds, written as instructions / the voice every new tale starts with.
_Avoid_: voice of the weave, how this book is written
_In code_: `writing_style`, `voiceOf`

**What he reads**:
What the model reads for the next passage, and how much of it fits, named in the writer's words.
The raw block names and tokens show only under Show detail.
_Avoid_: measurements, context, the prompt, manifest, budget
_In code_: manifest, context

**Export**:
Prompts to hand another model, whose answers come back into Anansi. (Was "Prompts to take
elsewhere" until 2026-10-27.)
_Avoid_: prompts to take elsewhere, pattern book, the web, the forge
_In code_: forge

## Starting and keeping tales

**New tale**:
Start a tale, by spark (from an idea), blank, or import.
_Avoid_: cut a new tale, create a story, new story, start it yourself, forge the whole thing
_In code_: spark, blank

**Try it on**:
The step of a new tale where Anansi reads it back and says what he would change.
_Avoid_: a second look, read back
_In code_: `spark/review`

**Fold away / Folded**:
Put a tale at the end of the library / a tale put there.
_Avoid_: archive, archived, put away, shelve
_In code_: `status` = `archived`

**Reset**:
Put an edited prompt or voice back to the one Anansi ships with.
_Avoid_: back to the house cut, default, shipped, back to the shipped
_In code_: the shipped prompt

**Drawers**:
The side drawers of the app, each called by its own name (Workbench, Threads, What he reads).
_Avoid_: panel, panels
_In code_: panel

## Who writes

**Local model**:
A model run on this machine. Anansi's default, and the only kind that ever runs the knot check.
The rest of the background work follows the writer's model (ADR 0002).
_Avoid_: router model, home model

**Remote model**:
A model run by Featherless and chosen on purpose by a writer. The tale's text goes to Featherless
for every passage it writes.
_Avoid_: cloud model, API model, online model

**This tale's model / Your model**:
A model chosen for one tale / the model a writer uses everywhere else.
_Avoid_: pin, pinned, default model
_In code_: `stories.model`, `default_model`

**Shortlist**:
One writer's own list of remote models, added from the Featherless catalogue. It appears on that
writer's model menu beside the local models, and on no one else's.
_Avoid_: favourites, my models, library
