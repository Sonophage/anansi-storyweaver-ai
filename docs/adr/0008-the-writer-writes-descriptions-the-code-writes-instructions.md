# The writer writes descriptions, the code writes the instructions

Seth decided this on 2026-10-28. It changes how ADR 0005's pockets are kept, not what they are for.

## Why

ADR 0005 made pockets instructions rather than text to repeat, and the code already turns three
kinds into instructions when the prompt is built (outfit, voice, interiority). The rest reach the
model as `[label: text]`, and 47 stored pockets and Always trues carry brackets and labels in the
writer's own box ("[wearing: …]", "[Lion El'jonson: …]"), put there by the lookups, the cast, and
Talk during setup. The writer then edits formatting meant for the model.

## The decision

**A pocket and an Always true hold a plain description, and nothing else.** That is what the writer
sees and types, and what every part of Anansi that writes one stores: no brackets, no thread name
in front, no instruction wording.

**The code turns each kind into the instruction the model reads**, when the prompt is built, from
the thread's name and the description. For example, a voice pocket reaches the model as "When
Talia speaks, write the dialogue this way: …". Every kind has one such frame, in one place.

**Every change to a pocket or an Always true keeps the old version**, so it can be put back, as the
thread's other fields already can.

## Consequences

- A one-way update strips the brackets and leading names from the pockets that have them, after
  a backup; the update report lists each one.
- New frames for the kinds that have none are prompt changes. They are owed a measurement against
  a control before anyone calls them an improvement (CLAUDE.md: prompt clauses measure flat more
  often than not).
