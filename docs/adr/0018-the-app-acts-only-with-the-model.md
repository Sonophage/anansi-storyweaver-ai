# The app acts only with the model, not with word rules on free text

Seth decided this on 2026-11-04 (night), after five failed reviews of Talk.

## The decision

- **The app does not read intent out of free text with word rules.** It acts with the model.
- From F70 he kept the "safe core": an identical rewrite is refused, a rename with no name is
  explained, and a bare "set it up" is the press. The rest of F70's fixes were parked.
- #158: the asked rule was folded into the setup talk (`draftAsked`, `held`).
- #157: the direction card sits in its answer and is kept.

## Open

ADR 0014's asked rule (a change counts as asked only when the message names its thread or kind) is
still in the code as `askedOf` and `draftAsked`. This ADR does not say whether that rule stays.
Ask Seth before you add or remove a word rule.
