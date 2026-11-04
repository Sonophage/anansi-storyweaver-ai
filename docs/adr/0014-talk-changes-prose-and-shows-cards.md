# Talk shows its changes as cards, and may change prose when asked

Seth decided this on 2026-11-04, in the grill on the new Talk (spec #138). It changes ADR 0007 in
three places: "No prose", the refusal to rename a thread, and "offered means chalked" as something
the writer finds on the Workbench. ADR 0007's rule that asked means done and offered means chalked
still holds.

## Why

Seth could not tell what Talk had really done. On 2026-11-03 it said it had filled Seraphine's card
when it had not, and on 2026-11-04 it wrote two promises and an instruction nobody asked for. A line
of text with Undo was easy to miss, and an offer went to the Workbench where he did not see it. He
also wanted Talk to fix the story itself: a character renamed, a piece of lore taken out, a
paragraph made colder.

## The decision

- **Every change is a card in the conversation, the Workbench's own card.** What the writer asked
  for is done, and its card shows what it was, what it is now, and Undo. What Anansi offers unasked
  is a chalked card with Sew it in and Reject, in the conversation as well as on the Workbench.
- **One card per thread**, its pockets inside, each with its own Undo and the card with Undo all;
  an offer the same, with Sew in all and a Reject per pocket. An offer is one chalked card, shown in
  the conversation and on the Workbench, and deciding it in one place decides it in both.
- **The app decides what was asked, as well as the model.** A change counts as asked only when the
  writer's message, or the exchange just before it, names its thread or its kind. Anything else is
  an offer, whatever the model called it.
- **Asked to make a thread the tale already has, Talk changes that thread.**
- **Talk may change existing prose when asked.** One passage anywhere in the tale, named by scene
  and passage or by a quote, is edited in place and kept in its Alterations, with a card and Undo.
  Talk does not write new passages: that stays with the five actions.
- **A rename is done when asked**: the thread, its wake words, and the name in every passage, every
  other thread's text, the strings and the premise, as one card with one Undo.
- **An Undo never writes over the writer.** It puts back every place still as Talk left it, skips any
  the writer has changed since, and says which it skipped.
- **Taking lore out of the prose is offered, never done**: one chalked card per passage, each with
  its rewrite, because each is the model's judgement.
- **Talk may start a hem of the scene the writer is in, and change the tale's model, only when
  asked.** It knows which model writes the tale and what is on the writer's shortlist, and may
  advise on them. It never offers either. A model it switches is pinned to the tale and becomes the
  writer's model for new tales, as a pick on the tale's Model tab does.
- **Advice changes nothing.** What Anansi suggests comes as cards: a thread or a string to sew in or
  reject, a direction to put in the composer.
- **A new tale can be set up by talking.** New tale's own Talk fills the draft, and Start makes the
  tale; asked in so many words, Anansi presses Start himself. The I–IV steps stay for a writer who prefers the form.

## Considered and not chosen

- **Everything waits for Sew it in, even what was asked**: safest, and every change costs a second
  press; ADR 0007 turned it down and it stays turned down.
- **Trust the model's own label for asked and offered**: it is what wrote three unasked changes in
  one answer.
- **Talk writes new prose**: the composer and its five actions already do that, with the controls
  the writer uses for it.
- **A rewrite of lore done in one press**: one Undo would hide a dozen judgement calls.
- **A second way into a new tale, from the library**: New tale works well, and its Talk already
  fills the draft.
