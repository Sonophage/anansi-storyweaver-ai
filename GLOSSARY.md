# Anansi

A local-first app for writing long-form fiction with a model. These are the words for the parts
of a book that the writer and the model share.

## Remembering the book

**Chapter summary**:
A short record of what happened in one chapter, which stands in for that chapter's prose once the
book has moved past it. It is either **yours** or **Anansi's**, by who last wrote it.
_Avoid_: synopsis, recap

**Act**:
One summary that stands in for a run of consecutive chapters, in place of their own chapter
summaries.
_Avoid_: arc, roll-up

**Yours / Anansi's**:
Who wrote a passage or a summary: the writer by hand, or the model. Fixing any part of Anansi's
summary by hand makes it yours.
_Avoid_: human, model, manual, generated

**Stale**:
A chapter summary whose chapter has changed since it was written. A stale summary does not reach
the model until it is written again.
_Avoid_: outdated, invalid

**Out of date**:
An act whose chapters have changed since it was written. Unlike a stale summary, it still reaches
the model, with a warning to the writer.
_Avoid_: stale

## Who writes

**Local model**:
A model run on this machine. Anansi's default, and the only kind that ever runs the canon check.
The rest of the background work follows the writer's model (ADR 0002).
_Avoid_: router model, home model

**Remote model**:
A model run by Featherless and chosen on purpose by a writer. The book's text goes to Featherless
for every passage it writes.
_Avoid_: cloud model, API model, online model

**Weaving**:
The model planning, unseen, before it writes a passage, a Talk reply or an invention. Two uses: a
book's setting (off unless the writer turns it on for that book), and what a model can do (it
doesn't weave, it can switch weaving on and off, or it always weaves). The plan is never shown. Not
the Voice of the weave, which is how the book is written.
_Avoid_: thinking, reasoning, planning, chain of thought

**Shortlist**:
One writer's own list of remote models, added from the Featherless catalogue. It appears on that
writer's model menu beside the local models, and on no one else's.
_Avoid_: favourites, my models, library
