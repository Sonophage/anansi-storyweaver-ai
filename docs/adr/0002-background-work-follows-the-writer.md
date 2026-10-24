# Background work follows the writer's model, except the canon check

Partly supersedes ADR 0001, which kept every background call on the local default.

Chapter summaries and roll-ups, the book-creation sparks, and the card passes (extraction at
chapter close, the one-card scan, memory and retiring) now use the model the writer writes with:
the book's pin, else the writer's default. The sparks run before a book exists, so they use the
writer's default. Seth decided this on 2026-10-23, and asked to widen it step by step.

Two things made it possible. First, no model either writer can pick takes more than 2 of the
plan's 4 units (the gate in `src/catalogue.ts`), so one writer's background work leaves room for
the other writer's passage. Second, every model on a shortlist can be told not to weave, so the
short caps on these calls (a summary is 280 tokens) are not spent on a plan.

Two exceptions stay on the local default:

- **The canon check.** It runs on every passage that lands. On Featherless it would take 2 units
  each time, and with two writers that fills the plan. It is also the role F43 measured on the
  local model.
- **A book whose model always weaves.** A plan would eat the short caps whole (F5, F23).

Costs accepted: these roles were measured on the local model and are not measured on remote ones
yet; the book's text goes to Featherless for this work too; and a busy plan can now delay a
chapter close, which reports the pass that did not run as it already does.
