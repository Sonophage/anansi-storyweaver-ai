# Remote models sit beside the local one, and never write the background work

Anansi can use models run by Featherless as well as the local router. Every model id carries its
source, and there is one adapter, for Featherless only: no general "any provider" layer was built,
because no second provider has been chosen. One server-side Featherless key serves every writer, so
both writers share one plan's concurrency (4 units: two 35B generations at once). A remote model
writes only what the writer asked for (prose, Talk, Invent); summaries, the canon check, memory and
extraction stay on the local default, as they already did. That keeps the measured roles on the
model they were measured on and keeps background calls from spending the shared units, at the cost
of the background failing when this machine is off. A refused request (HTTP 429) is retried, then
reported to the writer; it never falls back to another model silently.
