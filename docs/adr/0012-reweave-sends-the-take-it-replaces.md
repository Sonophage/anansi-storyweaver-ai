# A reweave sends the take it replaces

Seth decided this on 2026-10-29. It reverses the rule of 2026-09-18 that kept the take out of a
reweave's prompt.

Seth's words: "For reweave it should send the last entry that didn't work, and reweave needs two
fields: original instruction and what didn't work about the last one. Reweave as the instruction
should send the original instruction, the last entry that didn't work, and if filled the new
instruction of why it didn't work."

## Why

From 2026-09-18 a reweave sent the same prompt that wrote the passage. The take being replaced was
not in it. So the model did not know what the writer had rejected, and a reweave could write the
same thing again. The writer also had no place to say what was wrong with it.

## What went wrong in September

The take was first left out on purpose. A reweave of passage N is built from the passages before N,
so that the new take does not see what comes after it. From 2026-09-01 to 2026-09-18 a reweave had
its own wording, "write this passage again". That wording named the one passage that the prompt did
not contain. The last passage the model could see was N-1, so it rewrote N-1. In a book where the
writer narrates and the model answers, Reweave gave her back her own paragraph. The fix was to drop
the wording and send the passage's own instruction again, with no reference to the take.

## The decision

- **The prompt for a reweave sends, in this order**, after the prose that comes before the passage:
  the passage's own instruction (with the edited directive, if the writer changed it), then the take
  being replaced, then the writer's note on what didn't work (if filled), then the writer's When you
  reweave line (if set).
- **All of it is in the MODE block.** The passage before is still the last prose. So "the passage
  above" in a mode's wording still points at the prose, as it did before.
- **The take is fenced and named as the version being replaced.** The frame says it is not part of
  the story and not prose to continue from. This matters because the system prompt says to continue
  from the final word of the text.
- **The frame says where to start** (where the prose above stops, the same place the replaced
  version starts), and it names both wrong readings: a continuation of the replaced version, and a
  rewrite of the passage before it. The September failure was the second one.
- **The frame has no example sentences.** The model copies quoted text. It is told not to copy the
  replaced version's sentences.
- **The Reweave box has two fields**: The instruction (as before) and What didn't work (new,
  optional, empty at the start).

## How this answers the September failure

In September the wording named a passage that was not in the prompt. Now the passage is in the
prompt, it is marked, and the instruction says which passage to write and where to start. The
passage before keeps its place as the last prose.

## Consequences

- **NOT MEASURED.** No run has compared this prompt with the plain reweave of 2026-09-18. It is owed
  an A/B: two servers at the same time, one router, the same reweaves, scored for how often the new
  take repeats the old one, continues from it, or rewrites the passage before it.
- A reweave's prompt is longer by one take. A book near its budget can overflow on a reweave where
  it would not before.
- Reweave on this seed no longer gives the same take back. The prompt now holds the take that is on
  screen, which is not the take that was replaced when the seed was first used.
- A reweave of a Narrate passage that answered an unfinished line sends no MODE block, so it sends
  no take and no note. The code marks this with a ponytail comment.
- A tap on Reweave reweaves at once, for every passage, with no note (Seth, 2026-10-29: "the button
  just reweaves; holding the reweave button opens what we just built"). A hold, or Alt+click at a
  desk, opens the Reweave box for any passage. This replaces #38's rule that a tap on a directed
  passage opened the box. A passage with no directive shows its own mode instruction in the box;
  left unchanged, it is not sent as a directive.
