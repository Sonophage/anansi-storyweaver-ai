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

Six live documents, and that is the whole set. There was an archive of 18 superseded ones; it was
deleted on 2026-09-07, once the code had been made self-contained. Comments still carry names like
`PLAN-08 Phase 2` and `SPEC §7.1` — those are **historical labels, not paths**. The sentence around
the label carries the meaning, `test/web.ts` fails if one ever stops doing so, and the documents
themselves live in git history.

| | status |
|---|---|
| `docs/findings/P0-FINDINGS.md` | **authoritative.** 59 measured findings. Wins over every other document on any point of fact, and the one thing here that cannot be re-derived by reading source |
| `docs/findings/BUILD-STATE.md` | **live.** What is built and what is missing, every line carrying the command that checks it |
| `docs/plans/PLAN.md` | **live.** Everything open: four decisions waiting on Seth, and the verified-missing work. Rewritten, never appended to |
| `docs/WHATS-NEW.md` | **live.** The release notes the app serves at `GET /api/whatsnew` |
| `docs/PROMPTS.md` | **live**, revision 2 — transcribed from the code |
| `docs/findings/COUNCIL-05..10.md` | **historical record** of review events, kept for their arguments |
| `docs/bugs.md` | **empty of open items** as of 2026-09-06; all eleven were verified built or answered |

And the one command that outranks all of them:

```bash
node --experimental-strip-types status.ts
```

## The debt ledger

Every deliberate shortcut carries a `ponytail:` comment at its site, naming the ceiling and the
upgrade path. The ledger is harvested from the code, never from memory:

```bash
grep -rn "ponytail:" src web bench *.ts *.html
```
