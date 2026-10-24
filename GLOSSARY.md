# Anansi

A local-first app for writing long-form fiction with a model. These are the words for the parts
of a tale that the writer and the model share, and the only words the screens use for them.

Anansi is a spider and a tailor of stories. Both trades work in thread. **Spider words are for
making** new prose (weave, spin). **Tailor words are for handling what is made** (baste, alter,
mend, hem). Things keep plain or already-themed names. A word a new writer would not guess
carries its plain meaning in its tip the first time it appears.

Each term: what it means, the words a screen must not use for it (_Avoid_), and the name the code
uses where that differs (_In code_). The code keeps its own names; only the screens change.
`bench/words.ts` counts every _Avoid_ word still on screen.

## The tale and its parts

**Tale**:
What a writer writes: one story, made of scenes. Anansi is "she", and the tales are hers to spin.
_Avoid_: story, stories, book, books
_In code_: story

**Bolt**:
A collection of threads that tales draw on, holding no prose of its own: a bolt of cloth many
garments are cut from. A tale can be cut from a bolt and follow it.
_Avoid_: world book, world bible, world
_In code_: a story with `is_world`; a tale follows one through `lore_from`

**Rack**:
Where a writer's tales and bolts hang: the first screen.
_Avoid_: shelf, my stories, library, workspace
_In code_: workspace, shelf

**Scene**:
One section of a tale. A tale is written one scene at a time, and a scene is hemmed when it is
done.
_Avoid_: chapter, chapters
_In code_: chapter

**Panel**:
A run of consecutive scenes whose summaries are rolled into one, which stands in for them.
_Avoid_: acts, an act, arc, roll-up, roll up
_In code_: arc

**Passage**:
One piece of prose in a scene, written by the writer or by Anansi.
_Avoid_: block
_In code_: passage

**Fitting**:
One version of a passage. Reweaving makes a new fitting; one fitting is in the tale and the rest
are kept.
_Avoid_: takes, a take, re-roll
_In code_: take, generation

**Opens with / Heads toward**:
A scene's brief. Opens with: how the scene starts, sent until it has prose. Heads toward: where it
is going eventually, which the model is told not to reach yet.
_Avoid_: how it starts, where it ends, direction, the beat, author's note
_In code_: `opens_with`, `authors_note`

## What the tale remembers

**Thread**:
A fact about the tale that stays true until it is changed: a character, lore, an item or a rule.
_Avoid_: card, cards, entry, entries, canon, ledger, ledger entry
_In code_: entry

**Pocket**:
A named section inside a thread, switched on or off: an outfit, a fact sheet. Outfits are worn
and taken off; other pockets are on or off.
_Avoid_: room, rooms, slot, addon
_In code_: addon, slot

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

**Hemmed**:
A thread the tale is done with. It stops reaching the model; it can be brought back.
_Avoid_: finished, retired
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

**Tied off / Snipped**:
A string the tale kept / a string it abandoned.
_Avoid_: paid, paid off, let it go, dropped
_In code_: `status` = `paid` / `dropped`

**Scene summary**:
A short record of what happened in one scene, which stands in for that scene's prose once the
tale has moved past it. It is either **yours** or **Anansi's**, by who last wrote it.
_Avoid_: chapter summary, synopsis, recap
_In code_: `chapters.summary`

**Yours / Anansi's**:
Who wrote a passage or a summary: the writer by hand, or the model. Fixing any part of Anansi's
summary by hand makes it yours.
_Avoid_: human-written, model-written, manual, generated

**Stale**:
A scene summary whose scene has changed since it was written. A stale summary does not reach the
model until it is written again.
_Avoid_: outdated, invalid

**Out of date**:
A panel whose scenes have changed since it was written. Unlike a stale summary, it still reaches
the model, with a warning to the writer.
_Avoid_: stale

## Anansi's suggestions and the workbench

**Basted**:
What Anansi suggests, tacked in loosely until the writer decides: a new thread, a change to one, a
string, a thread to hem. Nothing basted is in the tale.
_Avoid_: proposal, proposed, suggestion, noticed, queue
_In code_: proposal

**Weave it in / Reject**:
Keep something basted / refuse it. The message after keeping says "Woven in."
_Avoid_: accept, add beside it, tie it, drop, dismiss, throw it back
_In code_: `decide` accept / reject

**Knot**:
A line of narration that contradicts a thread, found after a passage lands.
_Avoid_: contradiction, flag, the checker, violation
_In code_: violation, the canon check

**Mend / Ignore**:
Ask Anansi to rewrite the passage so the knot is gone / leave the knot for this scene. "Watch
again" undoes Ignore.
_Avoid_: let Anansi correct it, listen again
_In code_: `/api/mend`, muted

**Workbench**:
Where everything that wants the writer collects: basted things, unkept strings, knots, stale
summaries.
_Avoid_: waiting, chapter queue, inbox
_In code_: the `waiting` panel

## Writing

**Reweave**:
Ask for a new fitting of a passage.
_Avoid_: regenerate, re-roll, roll it again, write another, ask again
_In code_: reroll, regenerate

**Alter / Alterations**:
Edit a passage by hand / the list of a passage's fittings and edits.
_Avoid_: edit, edits, history
_In code_: edit, history

**Make a thread of this**:
Turn a passage into a basted thread.
_Avoid_: remember this
_In code_: `/api/memo`

**Hem this scene**:
End the scene: Anansi summarises it, bastes what it found, and the next scene opens.
_Avoid_: end this chapter, close the chapter, ritual
_In code_: `/api/chapter/end`

**Spinning**:
The model planning, unseen, before it writes a passage, a Talk reply or an invention. A tale's
switch (off unless the writer turns it on), and what a model can do (it doesn't spin, it can
switch spinning on and off, or it always spins). The plan is never shown.
_Avoid_: weaving, thinking, reasoning, planning, chain of thought
_In code_: `weaving`, `enable_thinking`

**You play**:
The character the writer speaks as. The field reads "You play"; "You are" is the old label.
_Avoid_: who you are, persona
_In code_: persona

**Hands off**:
The character the model never writes: no dialogue, action or thought for them.
_Avoid_: the model never writes, hold back, held back, locked character, lockout
_In code_: `locked_character`, `lockout_on`

**Voice / Your voice**:
How a tale's narration sounds, written as instructions / the voice every new tale starts with.
_Avoid_: voice of the weave, how this book is written
_In code_: `writing_style`, `voiceOf`

**Measurements**:
What the model reads for the next passage, and how much of it fits.
_Avoid_: context, the prompt, manifest, budget
_In code_: manifest, context

**Pattern book**:
Prompts to hand another model, whose answers come back into Anansi.
_Avoid_: the web, the forge
_In code_: forge

## Starting and keeping tales

**Cut a new tale**:
Start a tale, by spark (from an idea) or blank.
_Avoid_: create a story, new story, start it yourself, forge the whole thing
_In code_: spark, blank

**Try it on**:
The step of a new tale where Anansi reads it back and says what she would change.
_Avoid_: a second look, read back
_In code_: `spark/review`

**Fold away / Folded**:
Put a tale at the end of the rack / a tale put there.
_Avoid_: archive, archived, put away, shelve
_In code_: `status` = `archived`

**Back to the house cut**:
Reset an edited prompt or voice to the one Anansi ships with.
_Avoid_: default, shipped, back to the shipped
_In code_: the shipped prompt

**Drawers**:
The side drawers of the app, each called by its own name (Workbench, Threads, Measurements).
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
