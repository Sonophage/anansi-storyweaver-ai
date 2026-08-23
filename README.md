# Anansi

Local-first long-form fiction writing, on your own hardware. Two surfaces — a desktop document
editor and a phone client — on one engine, one API. No build step, no dependencies, no cloud.

The one promise: **a fact you write down in chapter one still holds in chapter forty.**

## Run it

```bash
node --experimental-strip-types serve.ts     # both surfaces: / and /phone
node --experimental-strip-types test/all.ts  # every suite, 88 checks, no model needed
node --experimental-strip-types run.ts       # one generation end to end (server must be up)
```

Needs Node 26+ (native TypeScript stripping, `node:sqlite`) and a `llama-server` on `:8080`.
Nothing else. There is no `package.json` and nothing to install.

## Layout

```
serve.ts        HTTP shell and the central ownership gate
desk.html       the desktop surface
phone.html      the phone surface
src/            the engine
  context.ts      buildContext — pure, the whole prompt-assembly decision
  blocks.ts       the block order. Named, never numbered
  render.ts       the only place block order becomes text
  db.ts           schema and all persistence
  routes.ts       the route table
  story.ts        view / assemble / budget
  llama.ts        the model transport
  import.ts       Anansi exports, AI Dungeon, character cards
  prompts.ts      every structured-role prompt
web/            client modules, shipped straight to the browser
test/           all.ts runs the five suites
bench/          measurement harnesses — the numbers in docs/findings come from here
docs/           spec, prompts, plans, councils, findings
```

## Read these first

- `docs/SPEC.md` — the engine reference
- `docs/findings/P0-FINDINGS.md` — **measured** numbers, which override the plans where they disagree
- `docs/findings/BUILD-STATE.md` — what is done, half-built, and not started, audited from the code

## The debt ledger

Every deliberate shortcut carries a `ponytail:` comment at its site, naming the ceiling and the
upgrade path. The ledger is harvested from the code, never from memory:

```bash
grep -rn "ponytail:" src web bench *.ts *.html
```
