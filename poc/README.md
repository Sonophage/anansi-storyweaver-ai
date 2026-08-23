# Anansi proof of concept

The engine only. No database, no Next.js, no auth, no Docker — those are CRUD and can wait.
This proves the part that is actually risky: that `buildContext` is pure, that the block order
holds, that the guard fires, and that pinned canon reaches the prose as story.

Zero dependencies. Node's native TypeScript stripping, so there is no build step.

```
node --experimental-strip-types poc/serve.ts     # both surfaces: / and /phone
node --experimental-strip-types poc/test-all.ts  # every suite (35 checks, no model needed)
node --experimental-strip-types poc/run.ts       # one generation end to end (server must be up)
python3 poc/bench/measure.py                     # prefill/decode curve
python3 poc/bench/overflow.py                    # what the server does past the ceiling
node --experimental-strip-types poc/bench/transports.ts   # which transport this model wants
node --experimental-strip-types poc/bench/nothink.ts      # cost of chain-of-thought
```

Findings are in `../P0-FINDINGS.md`. Everything there was measured, not inherited.

## Layout

| file | what |
|---|---|
| `src/blocks.ts` | The block order. **Named, never numbered** — three incompatible numberings existed across SPEC and PROMPTS. Blocks are per-entry; `kind` is an attribute. |
| `src/context.ts` | `buildContext`. Pure: plain objects in, manifest out, no I/O. Token counting is injected, so the whole engine is testable with no model running. |
| `src/render.ts` | Manifest → prompt string. The **only** source of ordering truth; there is no template anywhere. Also holds the system block. |
| `src/llama.ts` | Everything that touches the network, so `context.ts` stays pure. |
| `src/db.ts` | Persistence. `node:sqlite`, no dependencies. Schema is the Postgres target shape. |
| `src/story.ts` | Service: rows → the engine's plain objects. Routes never see SQL; the engine never sees a row. |
| `src/routes.ts` | Route table, one entry per endpoint. |
| `src/prompts.ts` | Prompt text and JSON schemas for the non-prose roles. |
| `web/api.js`, `web/model.js` | Shared by both surfaces. Add a story field to `model.js` and both render it. |
| `web/desk.js`, `web/phone.js` | One file per surface. |
| `test.ts` / `test-db.ts` / `test-web.ts` | Engine · persistence · client. `test-all.ts` runs all three. |
| `run.ts` | End to end, with canon-compliance assertions. |
| `fixture.ts` | One shared story fixture. |

## Environment

```
ANANSI_LLAMA=http://127.0.0.1:8080   ANANSI_MODEL=write-nt-qwen36-h
```

## What is deliberately not here

The budget engine's trim ladder, reservation, eviction ordering and the meter; keyword
sophistication beyond plain whole-word matching; vector recall; universes; branches; extraction;
summaries; and every screen. The manifest already carries `state` and `reason` on every block so
`partial` can be added without re-plumbing the renderer.

## Two bugs this found on its own

1. A triggered entry did not fire because the scan window read only prior prose, never the
   writer's directive — and the model then contradicted canon twice. Fixed in `context.ts`.
2. Six of seven end-to-end checks reported `ok` against zero output. A check that cannot fail is
   worse than no check; `run.ts` now gates on non-empty prose first.
