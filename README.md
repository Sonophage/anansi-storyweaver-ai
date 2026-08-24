# Anansi

Local-first long-form fiction writing, on your own hardware. Two surfaces — a desktop document
editor and a phone client — on one engine, one API. No build step, no dependencies, no cloud.

The one promise: **a fact you write down in chapter one still holds in chapter forty.**

## Run it

```bash
node --experimental-strip-types serve.ts     # the app on :5174 (/ and /phone are the same page)
node --experimental-strip-types test/all.ts  # every suite, no model and no browser needed
test/ui/run.sh                               # seven browser scenarios, each on a fresh copy
node --experimental-strip-types run.ts       # one generation end to end (server must be up)
```

`test/all.ts` needs neither a model nor a browser, so there is no excuse for skipping it. The
scenarios need chromium and a copy of the database. `test/ui/run.sh model` is separate because
every step in it waits on a real generation.

To drive the real UI — clicking and typing, in headless chromium, no dependencies:

```bash
test/ui/run.sh                # every scenario, each on a fresh copy of the database
test/ui/run.sh search         # one of them
```

The scenarios mutate — they rename entries, accept proposals, create stories — so the runner
resets the copy between each. Run them by hand against one copy in sequence and they poison each
other, and the failures look exactly like code regressions.

One scenario directly:

```bash
node --experimental-strip-types bench/drive.ts <url> <scenario.js>
```

Point it at a **copy** of the database. A screenshot found seven defects the suites could not;
the driver found an eighth that a screenshot could not, because the page looked right until
someone tried to type in it.

Needs Node 26+ (native TypeScript stripping, `node:sqlite`) and a `llama-server` on `:8080`.
Nothing else. There is no `package.json` and nothing to install.

## Layout

```
serve.ts        HTTP shell and the central ownership gate
app.html        the one surface. Responsive: the side panel becomes a bottom sheet on a phone
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
test/           all.ts runs the six suites; ui/ holds browser scenarios and run.sh
bench/          measurement harnesses — the numbers in docs/findings come from here,
                plus drive.ts, a headless browser that clicks and types
docs/           spec, prompts, plans, councils, findings
```

## The docs, and which to trust

Every document carries a status banner. The short version — these are a citation graph, not a pile,
so superseded documents are kept and marked rather than deleted:

| | status |
|---|---|
| `docs/findings/P0-FINDINGS.md` | **authoritative.** Measured off the machine; wins over every other document on any point of fact |
| `docs/findings/BUILD-STATE.md` | **live.** Done / half-built / not started, audited against source |
| `docs/SPEC.md` | **live** engine reference, except §13 and §14, which are marked dead in place |
| `docs/PROMPTS.md` | **live**, revision 2 — transcribed from the code |
| `docs/plans/PLAN-02.md` | **live** except where PLAN-03 moves things or a finding overrides it |
| `docs/plans/PLAN-03.md` | **live** re-ordering; its own F9 numbers are superseded by F15 |
| `docs/plans/PLAN-04.md` | **proposal, not agreed.** Characters and chapters, for the design conversation |
| `docs/plans/PLAN-01.md` | **superseded, do not follow.** Kept because COUNCIL-02 reviews it line by line |
| `docs/councils/*` | **historical record** of a review event. Cited by name from source comments |
| `docs/the-idea.md` | **historical.** The origin note |

## The debt ledger

Every deliberate shortcut carries a `ponytail:` comment at its site, naming the ceiling and the
upgrade path. The ledger is harvested from the code, never from memory:

```bash
grep -rn "ponytail:" src web bench *.ts *.html
```
