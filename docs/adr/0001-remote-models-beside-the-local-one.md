# Remote models sit beside the local one, and never write the background work

Partly superseded by ADR 0002: the background work now follows the writer's model, except the
canon check.

Anansi can use models run by Featherless as well as the local router. Every model id carries its
source, and there is one adapter, for Featherless only: no general "any provider" layer was built,
because no second provider has been chosen. One server-side Featherless key serves every writer, so
both writers share one plan's concurrency (4 units: two 35B generations at once). A remote model
writes everything the writer asks for: passages, Talk, Invent, and the other writer-triggered actions
that already followed the book's model (a repair, a thread from a passage, a chapter proposal, a world
cast, a card from the web, the style note). The background work (summaries, the canon check, memory,
extraction, sparks, roll-ups: every call that passes no model) stays on the local default, as it
already did. That keeps the measured roles on the
model they were measured on and keeps background calls from spending the shared units, at the cost
of the background failing when this machine is off. A refused request (HTTP 429) is retried, then
reported to the writer; it never falls back to another model silently.
