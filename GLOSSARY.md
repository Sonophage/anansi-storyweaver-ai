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
