# A thread is Always true, Over time, and pockets that are instructions

Seth decided this on 2026-10-26, in a grill after reading his own threads. The words are
GLOSSARY.md's. It replaces the 2026-10-24 pockets grill's "As it stands" text.

## Why

A thread held its knowledge in five places that did not agree on what each was for: a facts
pocket, the thread's own text (shown as Info), Over time (dated states), a pocket's from/until
scene, and a retired-at scene. The model writing them was told that facts is "the important one"
and that most findings belong in the thread's own text, so everything went there.

Halsey, in *A Night of Bedlam*, shows the result. Her facts call her a 26-year-old secretary; her
Info calls her a Grammy-nominated singer, and both reach the model on every call. Her Info mixes
who she is, what she wears and what has happened to her. Her Over time is empty. Her voice pocket
is a description ("voice remains thick Jersey accent even in digital text"), and scene 3's
narration repeats it ("the letters thick with her accent even in digital form").

## The decision

**A thread has three parts, each with one job.**

- **Always true**: who or what the thread is, evergreen. Anansi writes it only when the thread is
  made, or when the writer asks her to tidy the thread. After that only the writer changes it; if
  Anansi finds it wrong she raises a knot.
- **Over time**: one dated list per thread. Each entry is the whole of where the thread stands from
  that scene on, with a short label for what changed. An outfit put on and a retirement are entries
  in the same list. Info merges into it.
- **Pockets**: instructions on how to write one part of the thread (voice, outfit, interiority,
  appearance, relationships, atmosphere, who is here, what it does, consequences, and the writer's
  own). Never text to repeat. Role, provenance and scope fold into Always true; history folds into
  Over time.

**The model reads** Always true, the Over time entry in force at the scene being written, and the
pockets that are on or woken. Not the whole Over time list.

**Hemming reviews every thread the scene's narration mentions**, of every kind, not only
characters: it chalks an Over time entry and pocket changes, one Workbench card per thread. It may
add pockets only from the kind's fixed list, and new outfits.

**Each tale has one thread about itself.** Its Always true is the premise and setting; its pockets
are Voice, then the tale's Rules, then the writer's own. The Rule kind goes; spice, the cast
choices and the model stay settings. It has no Over time: the scene summaries are the tale's record.

## Considered and not chosen

- **Over time as changes only, all sent** (entries that add to each other): longer prompts, and it
  needs a way to say a change has ended. Whole entries carry what is still true forward instead.
- **Over time sent whole**: the model needs where the thread stands now, not its history.
- **Keeping the tale's Voice field beside tale-level instructions**: two homes for text written for
  the whole tale, which is this repo's costliest kind of bug.
- **Anansi sorting all 726 threads on update day**: hundreds of cards at once. The update moves
  text mechanically and offers "Tidy this thread" per thread instead.

## Consequences

- A one-way migration: facts pockets become Always true, Info becomes each thread's first Over time
  entry, rule threads become Rule pockets of their tale's thread. A backup runs first; the update
  report lists threads whose Always true and Info seem to disagree.
- Every prompt that writes a thread or a pocket changes: hemming, Make a thread of this, Read the
  scene, Write one for me, Look it up online, the new tale's cast.
- The voice pocket's frame gains "the narration never names or describes it" (narrowed on 2026-10-27 to "the narration never names how they sound": the wider form made a pocket that also held a personality dialogue-only). A prompt change: it
  is measured against a control before it is called a fix.
- One hem call for every thread or one per thread is decided on a measurement, not here.

2026-10-28: the canon check (knots) was deleted (#94); what this record says about it no longer applies.

2026-10-29: rules built. A rule is a pocket of no thread (`addons`, slot `rule`, with wake words),
beside the writer's own instructions, and not on the `tale` entry, which is made only at the first
hem. Each rule thread became one rule whose text is everything the thread sent (Always true, its
body, each consequence switched on); one on a word kept its words. Rules reach the model in canon,
where rule threads did. `rule` is no longer a kind of thread, so the cast, extraction, Talk and the
World lookup no longer offer one, and a rule no longer ends at a hem. Talk cannot add or change a
rule yet. A tale does not read its World's rules; no World had one.

2026-10-29, later: Talk adds a rule, changes its text or wake words, and switches it on or off, each
with Undo (ADR 0007).
