# Anansi

Local-first long-form fiction writing, on your own hardware. Two surfaces — a desktop document
editor and a phone client — on one engine, one API. No build step, no dependencies, no cloud.

The one promise: **a fact you write down in chapter one still holds in chapter forty.**

## Run it

```bash
node --experimental-strip-types serve.ts     # the app on :5174 (/ and /phone are the same page)

# Two writers over the tailnet. ANANSI_ALLOW is `login` or `login=account`, comma separated, and
# an unset one means loopback only. 0.0.0.0 rather than the tailnet address so the desk URL keeps
# working: a peer with no tailnet identity gets 403 from the gate either way. Both of them live in
# an untracked `.env` beside serve.ts — two real addresses — which the systemd user unit reads with
# EnvironmentFile. A run command would take the second writer away on the next reboot.
#
#   ANANSI_HOST=0.0.0.0
#   ANANSI_ALLOW=you@example.com=sonophage,them@example.com=them
#
node --env-file=.env --experimental-strip-types serve.ts
systemctl --user start anansi                # same .env, as a unit

# HTTPS over the tailnet, from a Tailscale-issued cert. Native TLS rather than `tailscale serve`
# in front: the proxy dials from loopback, so whois would see every peer as the desk. Both vars or
# neither — half a pair exits 2 rather than quietly serving plain HTTP.
tailscale cert hestia.tempel-discus.ts.net       # writes DOMAIN.crt and DOMAIN.key
ANANSI_CERT=hestia.tempel-discus.ts.net.crt ANANSI_KEY=hestia.tempel-discus.ts.net.key \
ANANSI_HOST=0.0.0.0 node --experimental-strip-types serve.ts
# run.ts and the bench scripts then need ANANSI_URL=https://hestia.tempel-discus.ts.net:5174 —
# they default to http://127.0.0.1:5174, and nothing plain answers on a TLS port.
node --experimental-strip-types test/all.ts  # every suite, no model and no browser needed
test/ui/run.sh                               # twelve browser scenarios, each on a fresh copy
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
test/           all.ts runs the eleven suites; ui/ holds browser scenarios and run.sh
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
| `docs/archived/SPEC.md` | **archived 2026-09-03.** The engine argument, not a description of the app — its writing modes and half its table names stopped being true long before it moved. Still cited by section from source comments |
| `docs/PROMPTS.md` | **live**, revision 2 — transcribed from the code |
| `docs/plans/PLAN-02.md` | **live** except where PLAN-03 moves things or a finding overrides it |
| `docs/plans/PLAN-03.md` | **live** re-ordering; its own F9 numbers are superseded by F15 |
| `docs/plans/PLAN-04.md` | **proposal, not agreed.** Characters and chapters, for the design conversation |
| `docs/archived/PLAN-01.md` | **superseded, do not follow.** Kept because COUNCIL-02 reviews it line by line |
| `docs/archived/COUNCIL-01..04.md` | **historical record** of a review event. Cited by name from source comments |
| `docs/plans/PLAN-06-MEMORY.md` | **live.** Memory, recall and the crowded scene; 2a/2b/2c/2d/2f closed, 2e part-built |
| `docs/plans/PLAN-07-VEIL.md` | **live.** The veil goes full screen; its three bugs are fixed, the designed work is ahead |
| `docs/checklist.md` | **live.** What is open and undecided. Opens with the questions waiting on Seth |
| `docs/bugs.md` | **live.** Reported and not yet scoped |
| `docs/findings/COUNCIL-05.md` | **live.** The code read first, the docs read second — 2026-08-28 |
| `docs/plans/DECISIONS.md` | **live.** Four decisions still waiting |
| `docs/archived/PLAN-01.md` | **superseded, do not follow.** Kept because COUNCIL-02 reviews it line by line |
| `docs/archived/COUNCIL-01..04.md` | **historical record** of a review event. Cited by name from source comments |
| `docs/archived/PLAN-05-TALK.md` | **built.** The scope talk shipped from |
| `docs/archived/NEXT-SESSION.md` | **superseded in part.** The argument that produced BUILD-STATE §7 and §8 |
| `docs/the-idea.md` | **historical.** The origin note |

Everything is under `docs/` as of 2026-08-28; `README.md` is the only markdown left at the root, and
`docs/archived/README.md` says what is in the archive and the rule for putting something there.

## The debt ledger

Every deliberate shortcut carries a `ponytail:` comment at its site, naming the ceiling and the
upgrade path. The ledger is harvested from the code, never from memory:

```bash
grep -rn "ponytail:" src web bench *.ts *.html
```
